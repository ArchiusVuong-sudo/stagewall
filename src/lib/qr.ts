import { headers } from "next/headers";
import QRCode from "qrcode";

/** The fan page URL as the venue would print it, from the request's own host. */
export async function joinUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? `127.0.0.1:${process.env.PORT ?? 4113}`;
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/join`;
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b0c14", light: "#ffffff" } });
}
