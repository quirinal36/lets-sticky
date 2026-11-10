import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { CheckIcon } from "./Icons";
import { Modal } from "./Modal";

export function ShareDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const url = location.href.split(/[?#]/)[0];
  const [copied, setCopied] = useState(false);

  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드를 쓸 수 없으면 주소를 직접 선택해 복사할 수 있다
    }
  };

  return (
    <Modal title={title} size="sm" onClose={onClose}>
      <div className="share">
        <div className="share-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="share-url">
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="보드 주소" />
          <button className="btn btn-primary" onClick={() => void copy()}>
            {copied ? (
              <>
                <CheckIcon size={16} />
                복사됨
              </>
            ) : (
              "복사"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
