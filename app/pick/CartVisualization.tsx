'use client'

export function CartVisualization({ 
  totalBins, 
  highlightedBins,
  completedBins,
  emptyBins,
  binQuantities,
  pickingMode,
}: { 
  totalBins: number
  highlightedBins: Set<number>
  completedBins: Set<number>
  emptyBins: Set<number>
  binQuantities?: Map<number, number>
  pickingMode?: string
}) {
  // Bulk uses 3 rows of 4 (shelves), others use 4x3 grid
  const cols = pickingMode === 'BULK' ? 4 : 4
  const bins = Array.from({ length: totalBins }, (_, i) => i + 1)
  
  return (
    <div 
      className="grid gap-4 w-full h-full"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {bins.map((bin) => {
        const isCompleted = completedBins.has(bin)
        const isEmpty = emptyBins.has(bin)
        const isHighlighted = highlightedBins.has(bin)
        const quantity = binQuantities?.get(bin)
        
        let bgColor = 'bg-white'
        let borderColor = 'border-gray-300'
        let textColor = 'text-gray-400'
        
        if (isEmpty) {
          bgColor = 'bg-gray-100'
          borderColor = 'border-gray-300'
          textColor = 'text-gray-300'
        } else if (isCompleted) {
          bgColor = 'bg-green-100'
          borderColor = 'border-green-500'
          textColor = 'text-green-700'
        } else if (isHighlighted) {
          bgColor = 'bg-blue-100'
          borderColor = 'border-blue-500'
          textColor = 'text-blue-700'
        }
        
        return (
          <div
            key={bin}
            className={`flex flex-col items-center justify-center rounded-2xl ${bgColor} ${borderColor} ${textColor}`}
            style={{ borderWidth: '4px' }}
          >
            {isEmpty ? (
              <span className="text-5xl font-bold">&mdash;</span>
            ) : isCompleted ? (
              <span className="text-5xl font-bold">&#10003;</span>
            ) : isHighlighted && quantity ? (
              <>
                <span className="text-2xl font-medium text-gray-500">{bin}</span>
                <span className="text-5xl font-bold">&times;{quantity}</span>
              </>
            ) : (
              <span className="text-5xl font-bold">{bin}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
