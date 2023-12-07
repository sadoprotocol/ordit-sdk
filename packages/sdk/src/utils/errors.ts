export class OrditSDKError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrditSDKError"
  }
}