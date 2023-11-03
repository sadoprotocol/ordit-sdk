export interface BrowserWalletSignPSBTResponse {
  hex: string
  base64: string | null
}

export type MessageSignatureTypes = "bip322-simple" | "ecdsa"
