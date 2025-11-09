export async function verifyPasswordEdge(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, originalHash] = storedHash.split(":");
  
  // Convert hex salt back to Uint8Array
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  // Encode password as Uint8Array
  const passwordBuffer = new TextEncoder().encode(password);
  
  // Import key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-512'
    },
    keyMaterial,
    512 // 64 bytes * 8 bits
  );
  
  // Convert to hex
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashVerify = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return originalHash === hashVerify;
}