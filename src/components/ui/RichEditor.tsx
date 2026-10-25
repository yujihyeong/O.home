'use client';
// 리치 텍스트 에디터 (TipTap) — 프로필 탭 등 HTML 콘텐츠 작성용
// 자체 스타일 툴바 (7장 — 기본 UI 금지) · 출력은 HTML, 저장 시 새니타이즈는 렌더 쪽에서 (6.3)
import { ImageIcon } from './Icons';
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Mark, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { putBlob } from '@/lib/blobStore';
import { stripImageMetaInfo } from '@/lib/imageMeta';
import { useToast } from '@/components/ui/Toast';
import {
  SpellPanel, SpellSession, shiftAfter, FontControls, FontPick, WholeFont, wholeFontStyle,
} from '@/components/ui/WriteTools';
import { useFonts } from '@/lib/fontStore';
import { findSpelling, SpellIssue } from '@/lib/writeTools';

/** 로컬 모드용 — 파일을 그대로 본문에 심는다 (서버가 없어 올릴 곳이 없을 때) */
function toDataUrl(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** 드래그한 부분의 글씨체·크기 — <span style="font-family / font-size"> (저장되는 HTML 그대로) */
const FontMark = Mark.create({
  name: 'fontStyle',
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: el => el.style.fontFamily || null,
        renderHTML: a => (a.fontFamily ? { style: `font-family:${a.fontFamily}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: a => (a.fontSize ? { style: `font-size:${a.fontSize}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[style]', getAttrs: el => ((el as HTMLElement).style.fontFamily || (el as HTMLElement).style.fontSize ? {} : false) }];
  },
  renderHTML({ HTMLAttributes }) { return ['span', HTMLAttributes, 0]; },
});

function TBtn({ on, label, title, onClick }: { on?: boolean; label: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" data-tip={title} className={`re-btn ${on ? 'on' : ''}`}
      onMouseDown={e => e.preventDefault()} onClick={onClick}>
      {label}
    </button>
  );
}

export function RichEditor({ value, onChange, placeholder, font, onReady }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 글씨체·크기 — 드래그한 부분이 있으면 그 부분만, 없으면 글 전체(setWhole) */
  font?: { whole: WholeFont; setWhole: (w: WholeFont) => void };
  /** 바깥 도구(검게 가리기 등)가 편집기를 직접 다룰 수 있게 */
  onReady?: (e: Editor | null) => void;
}) {
  const toast = useToast();
  const { familyOf } = useFonts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [spell, setSpell] = useState<SpellSession | null>(null);   // 맞춤법 검사 결과
  const editor = useEditor({
    extensions: [StarterKit, Image, FontMark],
    content: value || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 're-content prose' },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  useEffect(() => {
    onReady?.(editor ?? null);
    return () => onReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // 외부 값이 완전히 바뀐 경우(탭 전환) 동기화
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return <div className="re-wrap" style={{ minHeight: 200 }} />;

  /* 이미지는 **올려서** 넣는다 (v2.0 사용자 요청 — 예전엔 URL을 직접 적게 했다).
     다른 이미지들과 같은 경로(putBlob)를 타므로 서버 모드면 저장소에 올라가고 공개 주소가 나온다.
     서버가 없는 로컬 모드에서는 그 주소가 이 브라우저 안에서만 뜻이 있는 파일 id라
     <img>가 읽지 못한다 — 그때만 본문에 그대로 심는다(개발·오프라인용). */
  const insertImage = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const { blob: clean, removed } = await stripImageMetaInfo(f);   // 본문에 바로 심는 로컬 모드도 메타데이터 없이
      if (removed) toast('이미지 메타데이터를 지웠어요', { top: true });   // 위쪽에 짧게 (사용자 요청)
      const ref = await putBlob(clean);
      const src = /^https?:/.test(ref) ? ref : await toDataUrl(clean);
      editor.chain().focus().setImage({ src }).run();
    } catch (e) {
      // 조용히 실패하면 「올렸는데 왜 안 들어가지」가 된다 — 사유를 그대로 보여 준다
      toast(`이미지를 올리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const pickFont = (p: FontPick) => {
    if (!font) return;
    const { empty } = editor.state.selection;
    if (!empty) {
      const attrs = 'fontId' in p
        ? { fontFamily: p.fontId ? (familyOf(p.fontId) ?? null) : null }
        : { fontSize: p.fontSize ? `${p.fontSize}px` : null };
      editor.chain().focus().setMark('fontStyle', attrs).run();
      toast('드래그한 부분에 적용했습니다');
      return;
    }
    font.setWhole('fontId' in p
      ? { ...font.whole, fontId: p.fontId || undefined }
      : { ...font.whole, fontSize: p.fontSize ? Number(p.fontSize) : undefined });
    toast('글 전체에 적용했습니다');
  };

  /* 맞춤법 검사 — 드래그한 부분이 있으면 그 부분만, 없으면 글 전체.
     글자 노드마다 검사해 문서 위치(pos)로 기억한다 — 고칠 때 그 자리 글자가 그대로인지 확인 후 바꾼다 */
  const runSpell = () => {
    const { from, to, empty } = editor.state.selection;
    const [a, b] = empty ? [0, editor.state.doc.content.size] : [from, to];
    const found: SpellIssue[] = [];
    editor.state.doc.nodesBetween(a, b, (node, pos) => {
      if (!node.isText || !node.text) return;
      const s = Math.max(a, pos);
      const e = Math.min(b, pos + node.nodeSize);
      found.push(...findSpelling(node.text.slice(s - pos, e - pos), s));
    });
    const issues = found.map(i => ({ ...i, id: `${i.from}-${i.wrong}` }));
    if (!issues.length) {
      setSpell(null);
      toast(empty ? '고칠 곳을 찾지 못했습니다' : '드래그한 부분에서 고칠 곳을 찾지 못했습니다');
      return;
    }
    setSpell({ issues, scope: empty ? 'all' : 'sel' });
  };
  const fixOne = (i: SpellIssue): boolean => {
    const { doc } = editor.state;
    if (i.to > doc.content.size || doc.textBetween(i.from, i.to) !== i.wrong) return false;
    editor.view.dispatch(editor.state.tr.insertText(i.fix, i.from, i.to));   // 굵게 등 서식은 그대로
    return true;
  };
  const ctx = (i: SpellIssue): [string, string] => {
    const size = editor.state.doc.content.size;
    return [
      editor.state.doc.textBetween(Math.max(0, i.from - 14), i.from, ' '),
      editor.state.doc.textBetween(i.to, Math.min(size, i.to + 14), ' '),
    ];
  };

  return (
    <div className="re-wrap">
      <div className="re-toolbar">
        <TBtn title="굵게" label={<b>B</b>} on={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <TBtn title="기울임" label={<i>I</i>} on={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <TBtn title="취소선" label={<s>S</s>} on={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()} />
        <span className="re-sep" />
        <TBtn title="제목" label="H2" on={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <TBtn title="소제목" label="H3" on={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <span className="re-sep" />
        <TBtn title="글머리 목록" label="•≡" on={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <TBtn title="번호 목록" label="1≡" on={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <TBtn title="인용" label="❝" on={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <TBtn title="구분선" label="—" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <span className="re-sep" />
        <TBtn title="맞춤법 검사 — 드래그하면 그 부분만, 아니면 글 전체" label="가✓" on={!!spell} onClick={runSpell} />
        <span className="re-sep" />
        {font && <><FontControls whole={font.whole} onPick={pickFont} /><span className="re-sep" /></>}
        <TBtn title={busy ? '올리는 중…' : '이미지 올리기'} label={busy ? '⏳' : <ImageIcon size={15} />}
          onClick={() => { if (!busy) fileRef.current?.click(); }} />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void insertImage(f); }} />
        {/* 실행 취소·다시 실행은 모바일에서 숨김 — 툴바가 두 줄로 넘어가 본문 영역을 침범 (v1.9 사용자 확정)
            (단축키 Ctrl+Z / Ctrl+Shift+Z는 그대로 동작) */}
        <span className="re-sep re-hide-m" />
        <span className="re-hide-m" style={{ display: 'contents' }}>
          <TBtn title="실행 취소" label="↶" onClick={() => editor.chain().focus().undo().run()} />
          <TBtn title="다시 실행" label="↷" onClick={() => editor.chain().focus().redo().run()} />
        </span>
      </div>
      {spell && (
        <SpellPanel session={spell} context={ctx}
          onFix={i => {
            if (!fixOne(i)) { toast('글이 바뀌어 이 항목을 고치지 못했습니다 — 다시 검사해 주세요'); return; }
            setSpell(s => (s ? { ...s, issues: shiftAfter(s.issues, i) } : s));
          }}
          onFixAll={() => {
            let n = 0;
            for (const i of [...spell.issues].sort((x, y) => y.from - x.from)) if (fixOne(i)) n++;
            setSpell(s => (s ? { ...s, issues: [] } : s));
            toast(`${n}곳을 고쳤습니다`);
          }}
          onIgnore={i => setSpell(s => (s ? { ...s, issues: s.issues.filter(x => x.id !== i.id) } : s))}
          onPick={i => editor.chain().focus().setTextSelection({ from: i.from, to: i.to }).run()}
          onClose={() => setSpell(null)} />
      )}
      {/* 플레이스홀더는 본문 영역 기준으로 — 툴바가 두 줄이 돼도 안 밀림 (v1.9 사용자 발견) */}
      <div className="re-body" style={font ? wholeFontStyle(familyOf, font.whole) : undefined}>
        <EditorContent editor={editor} />
        {placeholder && editor.isEmpty && <div className="re-ph">{placeholder}</div>}
      </div>
    </div>
  );
}
