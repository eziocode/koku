import CryptoJS from "crypto-js";

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }

  return key;
}

export function encryptValue(value: string) {
  return CryptoJS.AES.encrypt(value, getEncryptionKey()).toString();
}

export function decryptValue(value: string) {
  const bytes = CryptoJS.AES.decrypt(value, getEncryptionKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}
