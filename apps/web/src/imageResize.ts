/**
 * Redimensiona e recomprime uma imagem localmente até caber no limite de bytes, sem subir nenhum
 * arquivo pro servidor separado — o resultado vira uma data: URL persistida junto do perfil/servidor.
 * `square` recorta pro maior quadrado central da imagem original antes de redimensionar: usado pra
 * avatar/ícone de servidor, que sempre renderizam num quadro quadrado/circular — sem isso, uma foto
 * retangular ficava espremida pelo `object-fit: cover` do CSS de forma imprevisível.
 */
export async function fileToResizedDataUrl(file: File, maxDimension: number, maxLength: number, square = false): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = square ? Math.round((bitmap.width - sourceSize) / 2) : 0;
  const sourceY = square ? Math.round((bitmap.height - sourceSize) / 2) : 0;
  const sourceWidth = square ? sourceSize : bitmap.width;
  const sourceHeight = square ? sourceSize : bitmap.height;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível processar a imagem.');
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxLength && quality > 0.25) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > maxLength) throw new Error('Imagem muito grande mesmo após compressão.');
  return dataUrl;
}
