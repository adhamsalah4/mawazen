/** يعرض رمز العملة - للريال السعودي يعرض الصورة الرسمية */
export function CurrencySymbol({
  currency,
  className = "inline-block align-middle",
  size = 16,
}: {
  currency?: string | null;
  className?: string;
  size?: number;
}) {
  const c = (currency ?? "SAR").toUpperCase();

  if (c === "SAR") {
    return (
      <span
        role="img"
        aria-label="ر.س"
        className={className}
        style={{
          width: size,
          height: size,
          display: "inline-block",
          backgroundColor: "currentColor",
          WebkitMaskImage: "url(/riyal-symbol.png)",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          WebkitMaskPosition: "center",
          maskImage: "url(/riyal-symbol.png)",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          maskPosition: "center",
        }}
      />
    );
  }

  return <span>{c}</span>;
}
