import Image from "next/image";

// A imagem original tem margens amplas. O enquadramento é feito apenas no CSS.
export default function AcrilexLogo({ width = 160 }: { width?: number }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width, height: width / 3.2, overflow: "hidden", verticalAlign: "middle", flexShrink: 0 }}>
      <Image
        src="/brand/acrilex-logo.png"
        alt="ACRILEX"
        width={1600}
        height={1600}
        unoptimized
        style={{ position: "absolute", top: "50%", left: 0, width: "100%", height: "auto", transform: "translateY(-50%)" }}
      />
    </span>
  );
}
