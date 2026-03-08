export function BackgroundDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 right-[-10%] h-80 w-80 rounded-full bg-primary/[0.03] blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[-5%] h-60 w-60 rounded-full bg-primary/[0.02] blur-[80px]" />
    </div>
  );
}
