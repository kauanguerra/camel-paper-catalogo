"use client";

import { useRouter } from "next/navigation";
import SellerCheckout from "@/components/SellerCheckout";

export default function SellerCheckoutPage() {
  const router = useRouter();

  return (
    <SellerCheckout
      open
      onClose={() => router.push("/catalogo")}
    />
  );
}
