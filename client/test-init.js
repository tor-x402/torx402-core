const { buildPedersenHash, buildMimcSponge } = require('circomlibjs');

async function test() {
  console.log('Testing circomlibjs initialization...');
  
  const pedersen = await buildPedersenHash();
  console.log('Pedersen hasher:', pedersen ? 'OK' : 'FAILED');
  console.log('Has hash method:', typeof pedersen.hash);
  console.log('Has F:', typeof pedersen.F);
  
  const mimc = await buildMimcSponge();
  console.log('MiMC hasher:', mimc ? 'OK' : 'FAILED');
  console.log('Has hash method:', typeof mimc.hash);
  console.log('Has F:', typeof mimc.F);
  
  // Try to use it
  const testData = Buffer.from('test');
  const hash = pedersen.hash(testData);
  const result = pedersen.F.toObject(hash);
  console.log('Hash result:', result);
  console.log('SUCCESS!');
}

test().catch(console.error);
