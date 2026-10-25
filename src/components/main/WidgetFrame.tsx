'use client';
// 위젯 프레임 (4.0 편집모드) — 드래그 이동 · 우하단 리사이즈 · 우클릭 겹침 순서 · 클릭 차단
// 프로토타입의 편집 모델을 계승: 그리드 배치는 유지하고 transform 오프셋 + 크기 동결(px)로 조작
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore, EDITABLE_TYPES, TITLELESS_TYPES } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { ConfirmModal } from '@/components/ui/Modal';

/** 위젯 하나가 오류로 멈춰도 메인 전체가 하얗게 죽지 않게 — 그 위젯 자리에만 오류 내용을 띄운다 (사용자 제보) */
class WidgetGuard extends React.Component<{ name: string; children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(`[widget:${this.props.name}]`, err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="panel widget wgt-err">
        <h4>위젯 오류</h4>
        <p>이 위젯을 그리다 문제가 생겼어요 — 아래 내용을 알려 주세요</p>
        <code>{this.props.name}: {this.state.err.message}</code>
        <button type="button" className="btn btn-ghost" onClick={() => this.setState({ err: null })}>다시 시도</button>
      </div>
    );
  }
}

/**
 * 편집모드 끌기 공통 (사용자 제보: 끌 때 버벅이고, 배경이 위아래로 움직임)
 *  · 움직임은 화면 한 프레임에 한 번만 반영
 *  · 끄는 동안 캔버스 높이는 줄어들지 않게 붙잡아 둔다 — 맨 아래 위젯을 올리면 캔버스가 줄면서
 *    스크롤이 같이 딸려 올라가 위젯은 제자리, 페이지만 움직이던 문제
 *  · 화면 위·아래 가장자리로 끌면 자동으로 스크롤, 스크롤된 만큼 위젯도 같이 따라온다
 *  · 손을 떼거나(터치 취소 포함) 하면 정리
 */
function dragSession(
  e: React.PointerEvent, el: HTMLElement, bodyCls: string,
  move: (dx: number, dy: number, ev: PointerEvent) => void,
  end: () => void,
  opts?: { noScroll?: boolean },
) {
  const scroller = document.getElementById('appMain');
  const grid = el.closest('.main-grid') as HTMLElement | null;
  const sx = e.clientX, sy = e.clientY;
  const sl = scroller?.scrollLeft ?? 0, st = scroller?.scrollTop ?? 0;
  const pid = e.pointerId;
  try { el.setPointerCapture(pid); } catch { /* 무시 */ }
  document.body.classList.add(bodyCls);   // 드래그 중 전역 커서 고정 — 커서 튐 방지 (v1.9)
  const holdH = grid ? grid.offsetHeight : 0;
  if (grid) grid.style.minHeight = `${holdH}px`;
  let last: PointerEvent | null = null, raf = 0, done = false;
  const apply = () => {
    if (!last) return;
    const dx = last.clientX - sx + ((scroller?.scrollLeft ?? 0) - sl);
    const dy = last.clientY - sy + ((scroller?.scrollTop ?? 0) - st);
    move(dx, dy, last);
    // 아래로 끌어 캔버스 밖으로 나가면 캔버스를 늘려 계속 내려갈 수 있게
    if (grid) {
      const need = el.offsetTop + el.offsetHeight + 40;
      if (need > grid.offsetHeight) grid.style.minHeight = `${need}px`;
    }
  };
  const frame = () => {
    raf = 0;
    if (done) return;
    apply();
    // 가장자리 자동 스크롤
    if (!opts?.noScroll && scroller && last) {
      const r = scroller.getBoundingClientRect();
      const edge = 56;
      let v = 0;
      if (last.clientY < r.top + edge) v = -Math.ceil((r.top + edge - last.clientY) / 4);
      else if (last.clientY > r.bottom - edge) v = Math.ceil((last.clientY - (r.bottom - edge)) / 4);
      if (v) {
        const before = scroller.scrollTop;
        scroller.scrollTop += Math.max(-24, Math.min(24, v));
        if (scroller.scrollTop !== before) raf = requestAnimationFrame(frame);
      }
    }
  };
  const mv = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    last = ev;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onScroll = () => { if (last && !raf) raf = requestAnimationFrame(frame); };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== pid || done) return;
    done = true;
    if (raf) cancelAnimationFrame(raf);
    if (ev.type === 'pointerup' && last) { last = ev; apply(); }
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    scroller?.removeEventListener('scroll', onScroll);
    try { el.releasePointerCapture(pid); } catch { /* 무시 */ }
    document.body.classList.remove(bodyCls);
    end();
    // 저장 상태가 반영된 다음 프레임에 캔버스 높이 붙잡기를 푼다
    requestAnimationFrame(() => { if (grid) grid.style.minHeight = ''; });
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  scroller?.addEventListener('scroll', onScroll, { passive: true });
}

export function WidgetFrame({ conf, mobileOrder, children, className, style, onCtx }: {
  conf: WidgetConf;
  mobileOrder: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onCtx: (id: string, x: number, y: number) => void;
}) {
  const { editOn, gridOn, updateWidget } = useMainStore();
  const { isAdmin } = useAuth();
  // 제목을 숨겨서(또는 원래 제목이 없어서) 「설정 ›」이 안 보이는 위젯 — 모서리에 ⚙ 버튼 (사용자 요청)
  const gear = isAdmin && !editOn && EDITABLE_TYPES.includes(conf.type) && conf.type !== 'polaroid' && (conf.noTitle || TITLELESS_TYPES.includes(conf.type));
  // 메인은 항상 고정 캔버스 (v1.9 — 반응형 옵션 제거, PC/모바일 두 가지만) — 저장 크기 상시 유지
  const useSize = true;
  const ref = useRef<HTMLDivElement>(null);
  // Shift+드래그 중앙 정렬에서 폭이 20px 배수가 아니라 딱 가운데가 안 될 때의 안내 (v1.9 사용자 요청)
  const [centerAsk, setCenterAsk] = useState<{ w: number; canvasW: number; grow: number; shrink: number } | null>(null);

  // 편집모드 진입 시 크기 동결 (v1.8 — 위젯 크기 독립)
  // 렌더된 크기 그대로 동결 — 진입만으로 위젯이 움직이거나 커지지 않음
  // (격자 정렬은 절대 격자 스냅이 담당하므로 여기서 10px 반올림하지 않음)
  useEffect(() => {
    if (!editOn || !ref.current) return;
    if (conf.w == null || conf.h == null) {
      const r = ref.current.getBoundingClientRect();
      if (r.width > 2) {
        updateWidget(conf.id, {
          w: Math.max(160, Math.round(r.width)),
          h: Math.max(80, Math.round(r.height)),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOn]);

  // PC 절대배치 (v1.9 사용자 확정) — ax/ay가 있으면 캔버스 절대 좌표로 렌더.
  // 문서 흐름이 없으므로 드래그·리사이즈 때 다른 위젯이 절대 밀리지 않고, 안 맞으면 겹친다.
  const abs = conf.ax != null && conf.ay != null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editOn || e.button !== 0) return;
    const t = e.target as HTMLElement;
    // body 포털(설정 모달·셀렉트 팝업·컬러피커 등)은 리액트 트리로 버블돼 들어옴 — 드래그 시작 아님 (v1.9)
    if (!ref.current?.contains(t)) return;
    if (t.closest('.rs') || t.closest('.rr')) return;
    e.preventDefault();
    const el = ref.current;
    if (abs) {
      // 절대 좌표 이동 — 그리드 원점 = 캔버스 좌상단이라 스냅 계산도 단순.
      // 끄는 동안은 화면의 위젯만 직접 옮기고, 손을 뗄 때 한 번만 저장 상태에 반영 (버벅임 방지)
      const bx = conf.ax!, by = conf.ay!;
      // Shift+드래그 = 캔버스 가로 한가운데 정렬 (v1.9 사용자 요청)
      const canvasW = (el.closest('.main-grid') as HTMLElement | null)?.clientWidth ?? 0;
      const myW = () => conf.w ?? Math.round(el.getBoundingClientRect().width);
      const snap = gridOn && !conf.freeMove;   // freeMove(그리드 무시)는 그리드가 켜져 있어도 자유 배치
      let centered = false, ax = bx, ay = by;
      dragSession(e, el, 'drag-move', (dx, dy, ev) => {
        const nx = bx + dx, ny = Math.max(0, by + dy);
        centered = ev.shiftKey && canvasW > 0;
        const cx = centered ? (canvasW - myW()) / 2 : nx;
        ax = snap ? Math.round(cx / 10) * 10 : Math.round(cx);
        ay = snap ? Math.round(ny / 10) * 10 : Math.round(ny);
        el.style.left = `${ax}px`; el.style.top = `${ay}px`;
      }, () => {
        if (ax !== bx || ay !== by) updateWidget(conf.id, { ax, ay });
        // 그리드(10px)에서 딱 가운데에 놓으려면 (캔버스폭 - 가로)가 20의 배수여야 함 — 아니면 5px 치우침
        if (centered && snap) {
          const w = myW();
          const r = (((canvasW - w) % 20) + 20) % 20;
          if (r !== 0) setCenterAsk({ w, canvasW, grow: r, shrink: 20 - r });
        }
      });
      return;
    }
    // (마이그레이션 전 폴백) 흐름 + transform 오프셋
    const bx = conf.tx, by = conf.ty;
    const gr = el.closest('.main-grid')?.getBoundingClientRect();
    const r0 = el.getBoundingClientRect();
    const natX = gr ? r0.left - bx - gr.left : 0;
    const natY = gr ? r0.top - by - gr.top : 0;
    dragSession(e, el, 'drag-move', (dx, dy) => {
      if (gridOn && !conf.freeMove) {
        updateWidget(conf.id, {
          tx: Math.round((natX + bx + dx) / 10) * 10 - natX,
          ty: Math.round((natY + by + dy) / 10) * 10 - natY,
        });
      } else {
        updateWidget(conf.id, { tx: bx + dx, ty: by + dy });
      }
    }, () => {});
  };

  // 기울기 (v1.9 사용자 요청 — 이미지·자유 텍스트) — 왼쪽 위 핸들 드래그로 위젯 중심 기준 회전
  const rotatable = conf.type === 'deco' || conf.type === 'freetext';
  const onRotDown = (e: React.PointerEvent) => {
    if (!editOn) return;
    e.stopPropagation(); e.preventDefault();
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = conf.rot ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    dragSession(e, el, 'drag-move', (dx, dy, ev) => {
      let deg = base + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
      deg = gridOn && !conf.freeMove ? Math.round(deg / 5) * 5 : Math.round(deg);
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      updateWidget(conf.id, { rot: deg === 0 ? undefined : deg });
    }, () => {}, { noScroll: true });
  };

  // 리사이즈 — 절대배치라 흐름 재배치가 없어 실시간 적용해도 다른 위젯이 밀리지 않음 (v1.9)
  // 이동과 같이 끄는 동안은 화면 크기만 바꾸고, 손을 뗄 때 저장 상태에 반영
  const onResizeDown = (e: React.PointerEvent) => {
    if (!editOn) return;
    e.stopPropagation(); e.preventDefault();
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    // 절대 격자 스냅: 좌상단이 격자에서 벗어나 있어도 "우/하단 모서리"가 캔버스 격자 위에 놓이게
    const gr = el.closest('.main-grid')?.getBoundingClientRect();
    const absL = abs ? conf.ax! : (gr ? r.left - gr.left : 0);
    const absT = abs ? conf.ay! : (gr ? r.top - gr.top : 0);
    let w0 = Math.round(r.width), h0 = Math.round(r.height), w = w0, h = h0;
    dragSession(e, el, 'drag-rs', (dw, dh) => {
      let nw = r.width + dw, nh = r.height + dh;
      if (gridOn && !conf.freeMove) {
        nw = Math.round((absL + nw) / 10) * 10 - absL;
        nh = Math.round((absT + nh) / 10) * 10 - absT;
      }
      w = Math.round(Math.max(160, nw));
      h = Math.round(Math.max(40, nh));   // 높이 최소 40 — 배경 없는 검색창처럼 얇은 위젯도 바짝 줄일 수 있게 (사용자 요청)
      el.style.width = `${w}px`; el.style.height = `${h}px`;
    }, () => {
      if (w !== w0 || h !== h0 || conf.w == null) updateWidget(conf.id, { w, h });
      w0 = w; h0 = h;
    });
  };

  return (
    <div
      ref={ref}
      data-wid={conf.id}
      className={`wgt ${useSize && conf.w != null ? 'sized' : ''} ${conf.mOff ? 'wgt-hide-m' : ''} ${conf.noTitle ? 'wgt-notitle' : ''} ${conf.noBg ? 'wgt-nobg' : ''} ${className ?? ''}`}
      style={{
        ...style,
        order: mobileOrder,
        // 절대배치 (v1.9) — PC 캔버스에는 흐름 없음. 모바일 CSS가 static으로 되돌려 스택 렌더
        // 기울기(rot)는 transform에 합성 — 모바일 스택에서는 CSS가 해제 (v1.9)
        ...(abs
          ? {
            position: 'absolute' as const, left: conf.ax, top: conf.ay, margin: 0,
            transform: conf.rot ? `rotate(${conf.rot}deg)` : undefined,
          }
          : {
            transform: [
              conf.tx || conf.ty ? `translate(${conf.tx}px, ${conf.ty}px)` : '',
              conf.rot ? `rotate(${conf.rot}deg)` : '',
            ].join(' ').trim() || undefined,
          }),
        width: useSize && conf.w != null ? conf.w : undefined,
        height: useSize && conf.h != null ? conf.h : undefined,
        zIndex: conf.z,
        // 모바일 스택에서 배너·이미지 위젯이 PC 비율 그대로 보이게 (모바일은 높이를 비우므로 0으로 접히던 문제)
        ...((conf.type === 'banner' || conf.type === 'images' || (conf.type === 'deco' && !conf.settings.hPx)) && conf.w && conf.h
          ? { '--wr': `${conf.w} / ${conf.h}` } as React.CSSProperties : {}),
      }}
      onPointerDown={onPointerDown}
      onContextMenu={e => {
        if (!editOn) return;
        if (!ref.current?.contains(e.target as Node)) return;   // 설정 모달 안 우클릭은 그대로
        e.preventDefault();
        onCtx(conf.id, e.clientX, e.clientY);
      }}
      // 편집모드 중 클릭 차단 (v1.8) — 단 body 포털(설정 모달 등)의 클릭은 통과 (v1.9)
      onClickCapture={e => {
        if (!editOn) return;
        const t = e.target as HTMLElement;
        if (!ref.current?.contains(t)) return;
        if (t.closest('.rs') || t.closest('.rr') || t.closest('.rx')) return;
        e.stopPropagation(); e.preventDefault();
      }}
    >
      <WidgetGuard name={conf.type}>{children}</WidgetGuard>
      {gear && (
        /* 이미지 위젯은 ⚙를 늘 보이게 (사용자 요청 — 마우스를 올려야 나와서 찾기 어려웠다) */
        <button type="button" className={`wgt-gear ${conf.type === 'images' ? 'show' : ''}`} aria-label="위젯 설정" data-tip="설정"
          onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('ohome-widget-edit', { detail: { id: conf.id } })); }}>⚙</button>
      )}
      {/* Shift+드래그 중앙 정렬 — 폭이 안 맞아 5px 치우칠 때 가로를 어느 쪽으로 맞출지 (v1.9 사용자 요청) */}
      <ConfirmModal open={centerAsk !== null}
        title="가운데에 딱 맞추려면 가로 크기를 조정해야 합니다"
        body={centerAsk
          ? `그리드가 10px 단위라, 지금 가로(${centerAsk.w}px)로는 중앙에서 5px 치우칩니다. 가로를 어느 쪽으로 맞출까요?`
          : undefined}
        onClose={() => setCenterAsk(null)}
        buttons={[
          {
            label: `가로 +${centerAsk?.grow ?? 10}px`, kind: 'dark',
            onClick: () => {
              if (centerAsk) {
                const w = centerAsk.w + centerAsk.grow;
                updateWidget(conf.id, { w, ax: (centerAsk.canvasW - w) / 2 }, { persist: true });
              }
              setCenterAsk(null);
            },
          },
          {
            label: `가로 −${centerAsk?.shrink ?? 10}px`, kind: 'ghost',
            onClick: () => {
              if (centerAsk) {
                const w = Math.max(160, centerAsk.w - centerAsk.shrink);
                updateWidget(conf.id, { w, ax: (centerAsk.canvasW - w) / 2 }, { persist: true });
              }
              setCenterAsk(null);
            },
          },
          { label: '그대로 두기', kind: 'ghost', onClick: () => setCenterAsk(null) },
        ]} />
      <span className="rs" data-tip="드래그로 크기 조절" onPointerDown={onResizeDown} />
      {/* 위젯 삭제 (사용자 요청 — 우클릭을 몰라도 바로 지울 수 있게). 확인은 메인 페이지의 경고 모달에서 */}
      {!conf.fixed && (
        <button type="button" className="rx" data-tip="위젯 삭제" aria-label="위젯 삭제"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => window.dispatchEvent(new CustomEvent('ohome-widget-del', { detail: { id: conf.id } }))}>✕</button>
      )}
      {rotatable && (
        <span className="rr" data-tip="드래그로 기울기 · 더블클릭 = 초기화"
          onPointerDown={onRotDown}
          onDoubleClick={() => updateWidget(conf.id, { rot: undefined })} />
      )}
    </div>
  );
}
