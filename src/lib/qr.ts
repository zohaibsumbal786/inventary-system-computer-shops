import QRCode from "qrcode";

export async function makeQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 200, margin: 1 });
}
