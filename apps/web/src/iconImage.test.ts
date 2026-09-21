import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dataUrlIsAnimated, isAnimatedImage, sniffIconFormat } from './iconImage.js';

const ascii = (text: string) => Array.from(text).map((character) => character.charCodeAt(0));

// Um GIF de 1x1 com N quadros (cada um com seu bloco de controle gráfico).
function gif(frames: number): Uint8Array {
  const header = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff];
  const frame = [0x21, 0xf9, 0x04, 0x00, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0];
  return new Uint8Array([...header, ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);
}

function png(animated: boolean): Uint8Array {
  const chunk = (type: string, body: number[]) => [0, 0, 0, body.length, ...ascii(type), ...body, 0, 0, 0, 0];
  return new Uint8Array([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...chunk('IHDR', new Array(13).fill(0)), ...(animated ? chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]) : []), ...chunk('IDAT', [0, 0])]);
}

function webp(animated: boolean): Uint8Array {
  const vp8x = [...ascii('VP8X'), 10, 0, 0, 0, animated ? 0x02 : 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...vp8x]);
}

describe('sniffIconFormat', () => {
  it('reconhece os formatos aceitos pelo conteúdo, não pela extensão', () => {
    assert.equal(sniffIconFormat(gif(1)), 'gif');
    assert.equal(sniffIconFormat(png(false)), 'png');
    assert.equal(sniffIconFormat(webp(false)), 'webp');
    assert.equal(sniffIconFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpeg');
  });

  it('recusa o que não é imagem', () => {
    assert.equal(sniffIconFormat(new Uint8Array(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))), null);
    assert.equal(sniffIconFormat(new Uint8Array([])), null);
  });
});

describe('isAnimatedImage', () => {
  it('GIF com um quadro é estático, com mais de um é animado', () => {
    assert.equal(isAnimatedImage(gif(1), 'gif'), false);
    assert.equal(isAnimatedImage(gif(3), 'gif'), true);
  });

  it('PNG animado tem o bloco acTL', () => {
    assert.equal(isAnimatedImage(png(false), 'png'), false);
    assert.equal(isAnimatedImage(png(true), 'png'), true);
  });

  it('WebP animado tem o bit de animação no VP8X', () => {
    assert.equal(isAnimatedImage(webp(false), 'webp'), false);
    assert.equal(isAnimatedImage(webp(true), 'webp'), true);
  });

  it('JPEG nunca é animado', () => {
    assert.equal(isAnimatedImage(new Uint8Array([0xff, 0xd8, 0xff]), 'jpeg'), false);
  });
});

describe('dataUrlIsAnimated', () => {
  const toDataUrl = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

  it('lê a animação de uma data: URL', () => {
    assert.equal(dataUrlIsAnimated(toDataUrl(gif(4), 'image/gif')), true);
    assert.equal(dataUrlIsAnimated(toDataUrl(gif(1), 'image/gif')), false);
  });

  it('ignora o que não é uma imagem em data: URL', () => {
    assert.equal(dataUrlIsAnimated(''), false);
    assert.equal(dataUrlIsAnimated('https://exemplo.com/icone.gif'), false);
  });
});
