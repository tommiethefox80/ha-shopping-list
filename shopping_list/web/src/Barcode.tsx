import { BrowserQRCodeSvgWriter } from '@zxing/browser';
import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';

/** Draws a card's barcode big and black-on-white for the till scanner. */
export function Barcode({ number, format }: { number: string; format: 'EAN13' | 'CODE128' | 'QR' }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = '';
    try {
      if (format === 'QR') {
        el.appendChild(new BrowserQRCodeSvgWriter().write(number, 280, 280));
      } else {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.appendChild(svg);
        JsBarcode(svg, number, { format, width: 3, height: 140, displayValue: true, fontSize: 22, margin: 16, background: '#ffffff', lineColor: '#000000' });
      }
    } catch {
      el.textContent = `Can't draw this as ${format}: ${number}`;
    }
  }, [number, format]);
  return <div className="barcode" ref={box} />;
}
