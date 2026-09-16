/** Redimensiona e recomprime uma imagem localmente até caber no limite de bytes, sem subir nenhum arquivo pro servidor separado — o resultado vira uma data: URL persistida junto do perfil/servidor. */
export async function fileToResizedDataUrl(file: File, maxDimension: number, maxLength: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível processar a imagem.');
  context.drawImage(bitmap, 0, 0, width, height);
  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxLength && quality > 0.25) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > maxLength) throw new Error('Imagem muito grande mesmo após compressão.');
  return dataUrl;
}
