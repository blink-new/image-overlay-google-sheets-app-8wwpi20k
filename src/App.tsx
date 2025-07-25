import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { Separator } from './components/ui/separator'
import { Upload, Download, Loader2, X, RotateCcw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface ImageData {
  name: string
  imageUrl: string
  thumbnailImageUrl: string
  fullSizeWidth: number
  fullSizeHeight: number
}

interface OverlayImage {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

function App() {
  const [imageData, setImageData] = useState<ImageData[]>([])
  const [loading, setLoading] = useState(false)
  const [baseImage, setBaseImage] = useState<string | null>(null)
  const [overlayImages, setOverlayImages] = useState<OverlayImage[]>([])
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Fixed Google Sheets URL
  const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSJwB7OdxotJFCbibmsh5cbGmb0SNwrP_5YUSOCPFwZ_JMIDrNNBmvxxqbDowsva1kR4_XSkN4ZnyMm/pubhtml'

  const addWatermark = async (imageSrc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      const img = new Image()
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        
        // Draw the original image
        ctx.drawImage(img, 0, 0)
        
        // Load and draw watermark
        const watermark = new Image()
        watermark.crossOrigin = 'anonymous'
        watermark.onload = () => {
          // Calculate watermark size (20% of image width)
          const watermarkWidth = canvas.width * 0.2
          const watermarkHeight = (watermark.height / watermark.width) * watermarkWidth
          
          // Position in lower right corner
          const x = canvas.width - watermarkWidth - 10
          const y = canvas.height - watermarkHeight - 10
          
          // Draw watermark with some transparency
          ctx.globalAlpha = 0.8
          ctx.drawImage(watermark, x, y, watermarkWidth, watermarkHeight)
          ctx.globalAlpha = 1.0
          
          resolve(canvas.toDataURL())
        }
        watermark.onerror = () => {
          // If watermark fails to load, return original image
          resolve(canvas.toDataURL())
        }
        // Convert the ibb.co URL to direct image URL
        watermark.src = 'https://i.ibb.co/bgvtdQjn/watermark.png'
      }
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = imageSrc
    })
  }

  const fetchGoogleSheetsData = async () => {
    setLoading(true)
    try {
      // Convert Google Sheets URL to CSV export URL
      const csvUrl = SHEETS_URL.replace('/pubhtml', '/export?format=csv&gid=0')
      
      const response = await fetch(csvUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch data from Google Sheets')
      }
      
      const csvText = await response.text()
      const lines = csvText.split('\n')
      const data: ImageData[] = []
      
      // Skip header row, parse data starting from row 2 (index 1)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const columns = line.split(',').map(col => col.replace(/"/g, '').trim())
        if (columns.length >= 6) {
          data.push({
            name: columns[1] || `Image ${i}`, // Column B
            imageUrl: columns[2] || '', // Column C - full size image
            thumbnailImageUrl: columns[3] || columns[2] || '', // Column D - thumbnail, fallback to C
            fullSizeWidth: parseInt(columns[4]) || 300, // Column E
            fullSizeHeight: parseInt(columns[5]) || 300, // Column F
          })
        }
      }
      
      setImageData(data)
      toast.success(`Loaded ${data.length} images from Google Sheets`)
    } catch (error) {
      console.error('Error fetching Google Sheets data:', error)
      toast.error('Failed to load data from Google Sheets. Make sure the sheet is publicly accessible.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-load data on component mount
  useEffect(() => {
    fetchGoogleSheetsData()
  }, [])

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const originalImage = e.target?.result as string
        
        try {
          // Add watermark to the uploaded image
          const watermarkedImage = await addWatermark(originalImage)
          setBaseImage(watermarkedImage)
          setOverlayImages([]) // Clear existing overlays
        } catch (error) {
          console.error('Error adding watermark:', error)
          // Fallback to original image if watermark fails
          setBaseImage(originalImage)
          setOverlayImages([])
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDragStart = (e: React.DragEvent, imageData: ImageData) => {
    e.dataTransfer.setData('application/json', JSON.stringify(imageData))
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (!canvasRef.current) return
    
    try {
      const imageData = JSON.parse(e.dataTransfer.getData('application/json')) as ImageData
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      
      const newOverlay: OverlayImage = {
        id: Date.now().toString(),
        src: imageData.imageUrl, // Use full-size image (column C)
        x: Math.max(0, x - 50), // Center on cursor
        y: Math.max(0, y - 50),
        width: Math.min(imageData.fullSizeWidth * 0.3, 150), // Scale down for initial placement
        height: Math.min(imageData.fullSizeHeight * 0.3, 150),
        originalWidth: imageData.fullSizeWidth,
        originalHeight: imageData.fullSizeHeight,
      }
      
      setOverlayImages(prev => [...prev, newOverlay])
      toast.success(`Added ${imageData.name} to tank`)
    } catch (error) {
      console.error('Error adding overlay:', error)
      toast.error('Failed to add overlay image')
    }
  }, [])

  const removeOverlay = (id: string) => {
    setOverlayImages(prev => prev.filter(overlay => overlay.id !== id))
    setSelectedOverlay(null)
  }

  const clearAllOverlays = () => {
    setOverlayImages([])
    setSelectedOverlay(null)
  }

  const exportImage = async () => {
    if (!baseImage || !canvasRef.current) {
      toast.error('Please upload a base image first')
      return
    }

    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Load base image to get dimensions
      const baseImg = new Image()
      baseImg.crossOrigin = 'anonymous'
      
      await new Promise((resolve, reject) => {
        baseImg.onload = resolve
        baseImg.onerror = reject
        baseImg.src = baseImage
      })

      canvas.width = baseImg.width
      canvas.height = baseImg.height

      // Draw base image (already has watermark)
      ctx.drawImage(baseImg, 0, 0)

      // Draw overlays
      for (const overlay of overlayImages) {
        const overlayImg = new Image()
        overlayImg.crossOrigin = 'anonymous'
        
        await new Promise((resolve, reject) => {
          overlayImg.onload = resolve
          overlayImg.onerror = reject
          overlayImg.src = overlay.src
        })

        // Scale overlay position and size relative to canvas
        const scaleX = canvas.width / canvasRef.current!.offsetWidth
        const scaleY = canvas.height / canvasRef.current!.offsetHeight
        
        ctx.drawImage(
          overlayImg,
          overlay.x * scaleX,
          overlay.y * scaleY,
          overlay.width * scaleX,
          overlay.height * scaleY
        )
      }

      // Download the composed image
      const link = document.createElement('a')
      link.download = 'coralscape-tank.png'
      link.href = canvas.toDataURL()
      link.click()
      
      toast.success('Tank exported successfully!')
    } catch (error) {
      console.error('Error exporting image:', error)
      toast.error('Failed to export tank')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-foreground">CoralScape</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Connected to Google Sheets</span>
                <Button variant="outline" onClick={fetchGoogleSheetsData} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-120px)]">
          {/* Image Repository Sidebar */}
          <div className="col-span-3">
            <Card className="h-full p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Corals & Inverts</h2>
                <span className="text-sm text-muted-foreground">{imageData.length} images</span>
              </div>
              <Separator className="mb-4" />
              
              {imageData.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 opacity-50 animate-spin" />
                  <p>Loading images from Google Sheets...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[calc(100vh-250px)]">
                  {imageData.map((image, index) => (
                    <div
                      key={index}
                      draggable
                      onDragStart={(e) => handleDragStart(e, image)}
                      className="group cursor-grab active:cursor-grabbing border rounded-lg p-2 hover:border-primary transition-colors"
                    >
                      <div className="aspect-square bg-muted rounded overflow-hidden mb-2">
                        <img
                          src={image.thumbnailImageUrl} // Use thumbnail from column D
                          alt={image.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            // Fallback to full-size image if thumbnail fails
                            (e.target as HTMLImageElement).src = image.imageUrl
                          }}
                        />
                      </div>
                      <p className="text-xs text-center truncate">{image.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Main Canvas Area */}
          <div className="col-span-9">
            <Card className="h-full p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Tank</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Image
                  </Button>
                  {overlayImages.length > 0 && (
                    <Button variant="outline" size="sm" onClick={clearAllOverlays}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Clear Overlays
                    </Button>
                  )}
                  <Button onClick={exportImage} disabled={!baseImage}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
              <Separator className="mb-4" />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              <div
                ref={canvasRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`relative w-full h-[calc(100vh-280px)] border-2 border-dashed rounded-lg overflow-hidden ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                } ${baseImage ? 'border-solid' : ''}`}
              >
                {baseImage ? (
                  <>
                    <img
                      src={baseImage}
                      alt="Base"
                      className="w-full h-full object-contain"
                    />
                    
                    {/* Overlay Images */}
                    {overlayImages.map((overlay) => (
                      <div
                        key={overlay.id}
                        className={`absolute cursor-move group ${
                          selectedOverlay === overlay.id ? 'ring-2 ring-primary' : ''
                        }`}
                        style={{
                          left: overlay.x,
                          top: overlay.y,
                          width: overlay.width,
                          height: overlay.height,
                        }}
                        onClick={() => setSelectedOverlay(overlay.id)}
                      >
                        <img
                          src={overlay.src}
                          alt="Overlay"
                          className="w-full h-full object-cover rounded shadow-lg"
                          draggable={false}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeOverlay(overlay.id)
                          }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Upload className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg mb-2">Upload an image to get started</p>
                    <p className="text-sm">Then drag corals & inverts from the repository to create your tank</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App