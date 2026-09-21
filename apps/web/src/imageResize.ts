import { ICON_MIME, isAnimatedImage, sniffIconFormat } from './iconImage';

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

export interface ServerImageOptions {
  // Tamanho máximo da data: URL (o arquivo, em base64, pesa 4/3 do original).
  maxLength: number;
  // O mesmo limite em megabytes, só para a mensagem de erro.
  maxMegabytes: number;
  // Imagem parada até esta dimensão (o lado maior) e dentro do limite é guardada exatamente como veio.
  keepDimension: number;
  // Acima disso a imagem parada é reduzida até este lado maior, mantendo a proporção.
  resizeDimension: number;
}

/**
 * Ícone ou painel de servidor: a imagem inteira, sem recorte. Quando já cabe no limite ela é guardada exatamente como veio
 * (o GIF ou WebP animado continua animado, o PNG mantém a transparência, nada é recomprimido). Só uma imagem parada grande
 * demais é reduzida, mantendo a proporção. Um GIF/WebP animado grande demais não dá para reduzir aqui, então a pessoa é avisada.
 */
export async function fileToServerImageDataUrl(file: File, options: ServerImageOptions): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffIconFormat(bytes);
  if (!format) throw new Error('Use uma imagem PNG, JPG, WebP ou GIF.');
  const animated = isAnimatedImage(bytes, format);
  const mime = ICON_MIME[format];
  const original = await blobToDataUrl(new Blob([bytes], { type: mime }));

  const bitmap = await createImageBitmap(file);
  const fitsAsIs = original.length <= options.maxLength && (animated || Math.max(bitmap.width, bitmap.height) <= options.keepDimension);
  if (fitsAsIs) {
    bitmap.close();
    return original;
  }
  if (animated) {
    bitmap.close();
    throw new Error(`Esse GIF animado passa de ${options.maxMegabytes} MB. Escolha um menor ou reduza o GIF antes de enviar.`);
  }

  let dimension = Math.min(options.resizeDimension, Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) break;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // WebP guarda transparência e pesa menos que PNG; a qualidade alta evita perder detalhe.
    for (const quality of [0.95, 0.85, 0.72]) {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      if (dataUrl.startsWith('data:image/webp') && dataUrl.length <= options.maxLength) {
        bitmap.close();
        return dataUrl;
      }
    }
    dimension = Math.round(dimension * 0.75);
  }
  bitmap.close();
  throw new Error('Não foi possível usar essa imagem. Tente um arquivo menor.');
}
