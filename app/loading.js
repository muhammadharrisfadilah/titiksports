export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-netflix-black">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-white/20 border-t-netflix-red rounded-full animate-spin" />
        <p className="text-gray-400 animate-pulse">Memuat...</p>
      </div>
    </div>
  );
}
