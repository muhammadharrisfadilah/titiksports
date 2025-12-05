export default function Loading() {
  return (
    <div className="min-h-screen bg-netflix-black">
      {/* Header skeleton */}
      <header className="sticky top-0 z-50 bg-netflix-black/95 backdrop-blur-sm border-b border-white/10">
        <div className="container-custom py-4 flex justify-between items-center">
          <div className="w-32 h-8 bg-white/10 rounded animate-pulse" />
          <div className="w-24 h-8 bg-white/10 rounded animate-pulse" />
        </div>
      </header>

      {/* Video player skeleton */}
      <div className="aspect-video bg-netflix-neutral animate-pulse" />

      {/* Content skeleton */}
      <div className="container-custom py-12 space-y-8">
        <div className="space-y-4">
          <div className="w-full h-8 bg-white/10 rounded animate-pulse" />
          <div className="w-3/4 h-6 bg-white/10 rounded animate-pulse" />
        </div>

        <div className="space-y-3">
          <div className="w-1/2 h-4 bg-white/10 rounded animate-pulse" />
          <div className="w-full h-4 bg-white/10 rounded animate-pulse" />
          <div className="w-5/6 h-4 bg-white/10 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
