export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const img = size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const text = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <div className="flex items-center gap-3">
      <img src="/icon-192.png" alt="" width={192} height={192} className={`${img} rounded-2xl`} />
      <span className={`font-display ${text} font-bold tracking-tight`}>
        Targe<span className="text-primary">X</span>
      </span>
    </div>
  );
}
