import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
  /** Keep the camera open and accept several barcodes (list mode). */
  continuous?: boolean;
  onCode: (ean: string) => Promise<string | void> | void;
  onClose: () => void;
}

const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);

export function Scanner({ title, continuous, onCode, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const [last, setLast] = useState<string>();
  const [manual, setManual] = useState('');
  const recent = useRef(new Map<string, number>());

  const handle = async (code: string) => {
    const seen = recent.current.get(code);
    if (seen && Date.now() - seen < 3000) return; // same pack still in view
    recent.current.set(code, Date.now());
    navigator.vibrate?.(60);
    const msg = await onCode(code);
    setLast(msg || `Scanned ${code}`);
    if (!continuous) onClose();
  };

  useEffect(() => {
    if (!window.isSecureContext) {
      setError('The camera needs HTTPS. Open Home Assistant through its https:// address (e.g. Nabu Casa or Tailscale) or type the barcode below.');
      return;
    }
    let controls: IScannerControls | undefined;
    let stopped = false;
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current!, (result) => {
        if (result && !stopped) void handle(result.getText());
      })
      .then((c) => {
        controls = c;
        if (stopped) c.stop();
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Camera permission was refused.' : e.message));
    return () => {
      stopped = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-backdrop scanner" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose}>Done</button>
        </div>
        {error ? <p className="notice warn">{error}</p> : (
          <div className="viewfinder">
            <video ref={video} muted playsInline />
            <div className="target" />
          </div>
        )}
        {last && <p className="notice ok">{last}</p>}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const code = manual.replace(/\D/g, '');
            if (code) void handle(code);
            setManual('');
          }}
        >
          <input inputMode="numeric" placeholder="Or type the barcode number" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
