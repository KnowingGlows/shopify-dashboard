export function BackgroundDecor() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -top-32 right-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.35),transparent_60%)] blur-3xl motion-safe:animate-[float_18s_ease-in-out_infinite]" />
      <div className="absolute top-20 left-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.25),transparent_65%)] blur-3xl motion-safe:animate-[float_22s_ease-in-out_infinite]" />
      <div className="absolute bottom-0 right-12 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.2),transparent_60%)] blur-3xl motion-safe:animate-[float_20s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.0),rgba(15,23,42,0.35))]" />
    </div>
  );
}
