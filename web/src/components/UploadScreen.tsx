import { useCallback, useRef, useState } from 'react';
import type { SessionAction } from '../state/session';
import { extractPacket, ApiError } from '../api/client';
import type { ApiErrorKind } from '../api/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 200 * 1024; // 200 KB
const ALLOWED_EXTS = ['.md', '.markdown', '.txt'];
const ALLOWED_MIME_PREFIXES = ['text/'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindMessage(kind: ApiErrorKind, serverMsg: string, status?: number): string {
  switch (kind) {
    case 'network':
      return "Can't reach the server. Check your connection and try again.";
    case 'timeout':
      return 'The server took too long to respond. Try again.';
    case 'http':
      return `Server error ${status ?? ''}: ${serverMsg}`.trim();
    case 'invalid_response':
      return 'The server returned something unexpected.';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  packetText: string;
  loading: boolean;
  dispatch: React.Dispatch<SessionAction>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UploadScreen({ packetText, loading, dispatch }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<{ msg: string; technical: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractBtnRef = useRef<HTMLButtonElement>(null);

  const previewLines = packetText.split('\n').slice(0, 40).join('\n');

  // -------------------------------------------------------------------------
  // File processing
  // -------------------------------------------------------------------------

  function validateAndReadFile(file: File): void {
    setFileError(null);

    // Size check
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File is too large (${formatBytes(file.size)}). Maximum is 200 KB.`);
      return;
    }

    // Type check — by MIME prefix or extension
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    const mimeOk = ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
    const extOk = ALLOWED_EXTS.includes(ext);
    if (!mimeOk && !extOk) {
      setFileError(`Only text files are accepted (.md, .markdown, .txt). Got "${file.name}".`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileName(file.name);
      setFileSize(file.size);
      dispatch({ type: 'SET_PACKET_TEXT', text });
      setExtractError(null);
    };
    reader.onerror = () => {
      setFileError('Could not read the file. Please try again.');
    };
    reader.readAsText(file, 'utf-8');
  }

  // -------------------------------------------------------------------------
  // Drag and drop handlers
  // -------------------------------------------------------------------------

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndReadFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndReadFile(file);
      // reset so same file can be re-selected
      e.target.value = '';
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // -------------------------------------------------------------------------
  // Sample loading
  // -------------------------------------------------------------------------

  async function loadSample(jobId: 'J01' | 'J04' | 'J08') {
    setFileError(null);
    setExtractError(null);
    try {
      const res = await fetch(`/samples/${jobId}.md`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setFileName(`${jobId}.md`);
      setFileSize(new Blob([text]).size);
      dispatch({ type: 'SET_PACKET_TEXT', text });
    } catch (err) {
      setFileError(`Could not load sample ${jobId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Extract
  // -------------------------------------------------------------------------

  async function handleExtract() {
    if (!packetText.trim() || loading) return;
    setExtractError(null);
    dispatch({ type: 'EXTRACT_START' });
    try {
      const result = await extractPacket(packetText);
      dispatch({ type: 'EXTRACT_SUCCESS', result });
    } catch (err) {
      const isApiErr = err instanceof ApiError;
      const kind: ApiErrorKind = isApiErr ? err.kind : 'network';
      const technical = err instanceof Error ? err.message : String(err);
      const msg = kindMessage(kind, technical, isApiErr ? err.status : undefined);
      if (!isApiErr) console.error('[extract]', err);
      else console.error('[extract]', kind, technical);
      dispatch({ type: 'EXTRACT_ERROR', message: msg });
      setExtractError({ msg, technical });
    }
  }

  function handleRetry() {
    setExtractError(null);
    handleExtract();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="upload-screen">
      <h2 className="review-screen__title">Upload job packet</h2>

      {/* Sample buttons */}
      <p className="upload-screen__section-title">Load a sample packet</p>
      <div className="sample-row">
        {(['J01', 'J04', 'J08'] as const).map((id) => (
          <button
            key={id}
            className="btn btn--secondary"
            onClick={() => loadSample(id)}
            disabled={loading}
            type="button"
          >
            Load {id}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div className="upload-screen__divider">or upload a file</div>

      <div
        className={`dropzone${dragActive ? ' dropzone--active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label="Drop a file here or click to browse"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/*"
          className="dropzone__input"
          onChange={onFileChange}
          aria-label="Upload packet file"
          tabIndex={-1}
        />
        <span className="dropzone__icon" aria-hidden>📄</span>
        <div className="dropzone__label">
          {dragActive ? 'Drop the file here' : 'Drag and drop, or click to browse'}
        </div>
        <div className="dropzone__sub">.md, .markdown, .txt · max 200 KB</div>
      </div>

      {/* File error */}
      {fileError && (
        <p role="alert" aria-live="polite" className="field__error" style={{ marginTop: '0.5rem' }}>
          {fileError}
        </p>
      )}

      {/* File info + preview */}
      {fileName && fileSize !== null && !fileError && (
        <>
          <div className="file-info">
            <span className="file-info__icon" aria-hidden>📋</span>
            <div className="file-info__meta">
              <div className="file-info__name">{fileName}</div>
              <div className="file-info__size">{formatBytes(fileSize)}</div>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              Replace file
            </button>
          </div>
          <div className="packet-preview">
            <div className="packet-preview__header">
              Preview (first 40 lines)
            </div>
            <pre className="packet-preview__body" aria-label="Packet preview">
              {previewLines}
            </pre>
          </div>
        </>
      )}

      {/* Paste alternative */}
      <div className="upload-screen__divider">or paste packet text</div>

      <label htmlFor="paste-input" className="visually-hidden">
        Paste packet text
      </label>
      <textarea
        id="paste-input"
        className="paste-area"
        placeholder="Paste the packet text here…"
        value={fileName ? '' : packetText}
        onChange={(e) => {
          setFileName(null);
          setFileSize(null);
          setFileError(null);
          setExtractError(null);
          dispatch({ type: 'SET_PACKET_TEXT', text: e.target.value });
        }}
        disabled={loading || !!fileName}
        aria-label="Paste packet text"
        rows={8}
      />
      {!!fileName && packetText && (
        <p className="field__help">Using uploaded file. Remove the file above to paste text instead.</p>
      )}

      {/* Extract error */}
      {extractError && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <span className="error-banner__message">{extractError.msg}</span>
          <div className="error-banner__actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleRetry}
              disabled={loading}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Extract button */}
      <div className="upload-actions">
        <button
          ref={extractBtnRef}
          type="button"
          className="btn btn--primary"
          disabled={!packetText.trim() || loading}
          onClick={handleExtract}
          aria-busy={loading}
        >
          {loading ? 'Reading the packet…' : 'Extract requirements'}
        </button>
        {loading && (
          <span className="upload-actions__status" aria-live="polite">
            Analyzing the packet…
          </span>
        )}
      </div>
    </div>
  );
}
