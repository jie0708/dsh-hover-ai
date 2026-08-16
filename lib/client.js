// dsh-hover-ai browser half (served at /plugins/dsh-hover-ai/client.js).
// Vanilla DOM: no React, no slots — a fixed-position popup near the cursor plus
// two small control pills at the bottom-right corner. All listeners and nodes
// are cleaned up by the disposer returned from apply().

window.__ModuleLoader__.load({
	id: "dsh-hover-ai",
	factory: () => {
		var module = { exports: {} };
		var exports = module.exports;

		var CSS = [
			'.hova-pop{position:fixed;left:0;top:0;width:320px;max-width:calc(100vw - 16px);pointer-events:auto;background:var(--dsw-alias-bg-overlay,#ffffff);color:var(--dsw-alias-label-primary,#111111);border:1px solid var(--dsw-alias-border-l1,#dddddd);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:10px 12px;font-size:13px;line-height:1.55;display:flex;flex-direction:column;gap:6px;z-index:2147483000;font-family:inherit;display:none}',
			'.hova-pop *{box-sizing:border-box}',
			'.hova-head{display:flex;align-items:center;gap:6px}',
			'.hova-badge{flex:none;font-size:11px;font-weight:600;color:var(--dsw-alias-brand-primary,#4c6fff);border:1px solid currentColor;padding:1px 6px;border-radius:999px;white-space:nowrap}',
			'.hova-title{flex:1;min-width:0;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.hova-close{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#555555);cursor:pointer;font-size:16px;line-height:1;padding:2px 5px;border-radius:6px}',
			'.hova-close:hover{background:var(--dsw-alias-bg-layer-1,#eeeeee);color:var(--dsw-alias-label-primary,#111111)}',
			'.hova-body{max-height:210px;overflow-y:auto;white-space:pre-wrap;word-break:break-word}',
			'.hova-loading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary,#555555);padding:6px 0}',
			'.hova-loading::before{content:"";width:12px;height:12px;border:2px solid var(--dsw-alias-border-l1,#cccccc);border-top-color:var(--dsw-alias-brand-primary,#4c6fff);border-radius:50%;animation:hova-spin .8s linear infinite;flex:none}',
			'@keyframes hova-spin{to{transform:rotate(360deg)}}',
			'.hova-error{color:var(--dsw-alias-state-error-primary,#d43333)}',
			'.hova-foot{font-size:11px;color:var(--dsw-alias-label-secondary,#999999);opacity:.85}',
			'.hova-pill{position:fixed;right:14px;bottom:14px;z-index:2147483001;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1,#dddddd);background:var(--dsw-alias-bg-layer-1,rgba(245,245,245,.92));color:var(--dsw-alias-label-secondary,#555555);border-radius:999px;padding:4px 12px;cursor:pointer;font-size:12px;line-height:1.4;font-family:inherit}',
			'.hova-pill:hover{border-color:var(--dsw-alias-brand-primary,#4c6fff)}',
			'.hova-pill.on{color:var(--dsw-alias-brand-primary,#4c6fff);border-color:currentColor}',
			'.hova-delay{right:14px;bottom:52px;min-width:40px;justify-content:center;padding:3px 8px;font-size:11px}',
		].join('\n');

		var WORD_RE = /[A-Za-z0-9_$]/;
		var STOP_RE = /[\s，。！？；：、,.!?;:()'"“”‘’《》<>\[\]{}【】…·—]/;

		function expandSnippet(full, offset) {
			if (!full) return null;
			if (offset < 0) offset = 0;
			if (offset > full.length) offset = full.length;
			var start = offset, end = offset;
			var left = full[start - 1], right = full[start];
			if ((left !== undefined && WORD_RE.test(left)) || (right !== undefined && WORD_RE.test(right))) {
				while (start > 0 && WORD_RE.test(full[start - 1])) start--;
				while (end < full.length && WORD_RE.test(full[end])) end++;
			} else {
				while (start > 0 && !STOP_RE.test(full[start - 1]) && offset - start < 14) start--;
				while (end < full.length && !STOP_RE.test(full[end]) && end - offset < 14) end++;
			}
			var text = full.slice(start, end).trim();
			if (!text) return null;
			if (text.length > 100) text = text.slice(0, 100) + '…';
			return text;
		}

		function directText(node) {
			var out = '';
			var kids = node.childNodes;
			for (var i = 0; i < kids.length; i++) if (kids[i].nodeType === 3) out += kids[i].textContent;
			return out;
		}

		function extractTextAt(x, y, el) {
			var node = null, offset = 0;
			try {
				if (typeof document.caretRangeFromPoint === 'function') {
					var range = document.caretRangeFromPoint(x, y);
					if (range) { node = range.startContainer; offset = range.startOffset; }
				} else if (typeof document.caretPositionFromPoint === 'function') {
					var pos = document.caretPositionFromPoint(x, y);
					if (pos) { node = pos.offsetNode; offset = pos.offset; }
				}
			} catch (e) { /* fall through */ }
			if (node && node.nodeType === 3) {
				var text = expandSnippet(node.textContent || '', offset);
				if (text) return { text: text, key: 't:' + text };
				return null;
			}
			var cur = el, hops = 0;
			while (cur && cur.nodeType === 1 && hops < 4) {
				var own = directText(cur);
				if (own.trim().length > 0 && own.length <= 300) {
					var t = own.trim().slice(0, 100);
					if (t) return { text: t, key: 'e:' + t };
				}
				cur = cur.parentElement;
				hops++;
			}
			return null;
		}

		exports.inject = ['timer'];
		exports.apply = function apply(ctx) {
			if (typeof document === 'undefined') return;

			var styleTag = null;
			if (document.querySelector('style[data-plugin-css="dsh-hover-ai/css"]') === null) {
				styleTag = document.createElement('style');
				styleTag.dataset.plugin = 'dsh-hover-ai';
				styleTag.dataset.pluginCss = 'dsh-hover-ai/css';
				styleTag.textContent = CSS;
				document.head.appendChild(styleTag);
			}

			var state = { enabled: true, delay: 1500, open: false, x: 0, y: 0, title: '', body: '', status: 'idle', error: '' };
			var subs = new Set();
			function setState(patch) {
				Object.assign(state, patch);
				subs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
			}

			var popupEl = null, toggleEl = null, delayEl = null;
			var pendingCountdown = null;
			var anchorKey = null;
			var seq = 0;
			var lastX = 0, lastY = 0;
			var openAnchorX = 0, openAnchorY = 0;
			// 约 3~5 厘米（113~189 CSS px）的鼠标移动即自动关闭弹窗
			var MOVE_DISMISS_PX = 180;

			function ensurePopup() {
				if (popupEl) return popupEl;
				popupEl = document.createElement('div');
				popupEl.className = 'hova-pop';
				popupEl.setAttribute('data-hover-ai', '1');
				popupEl.innerHTML = [
					'<div class="hova-head">',
					'<span class="hova-badge">✦ AI 知识点</span>',
					'<span class="hova-title"></span>',
					'<button type="button" class="hova-close" title="关闭 (Esc)">×</button>',
					'</div>',
					'<div class="hova-body"></div>',
					'<div class="hova-foot">移动鼠标约 3~5 厘米自动关闭 · 继续悬停换下一条 · Esc 关闭</div>',
				].join('');
				popupEl.querySelector('.hova-close').addEventListener('click', function () { closePopup(); });
				document.body.appendChild(popupEl);
				return popupEl;
			}

			function renderPopup() {
				var el = ensurePopup();
				if (!state.open) { el.style.display = 'none'; return; }
				var vw = window.innerWidth || 1280;
				var vh = window.innerHeight || 800;
				var left = state.x + 14, top = state.y + 18;
				if (left + 332 > vw) left = state.x - 332;
				if (left < 8) left = 8;
				if (top + 280 > vh) top = state.y - 280 - 12;
				if (top < 8) top = 8;
				el.style.display = 'flex';
				el.style.transform = 'translate(' + left + 'px,' + top + 'px)';
				el.querySelector('.hova-title').textContent = state.title || '';
				var body = el.querySelector('.hova-body');
				body.classList.remove('hova-error');
				body.textContent = '';
				if (state.status === 'loading') {
					var spin = document.createElement('div');
					spin.className = 'hova-loading';
					spin.textContent = 'AI 知识点准备中…';
					body.appendChild(spin);
				} else if (state.status === 'error') {
					body.classList.add('hova-error');
					body.textContent = state.error || '获取失败';
				} else {
					body.textContent = state.body || '';
				}
			}

			function ensureControls() {
				if (!toggleEl) {
					toggleEl = document.createElement('button');
					toggleEl.type = 'button';
					toggleEl.className = 'hova-pill';
					toggleEl.title = 'Hover AI 开关';
					toggleEl.addEventListener('click', function () {
						var next = !state.enabled;
						setState({ enabled: next });
						if (!next) { cancelCountdown(); closePopup(); }
						renderControls();
					});
					document.body.appendChild(toggleEl);
				}
				if (!delayEl) {
					delayEl = document.createElement('button');
					delayEl.type = 'button';
					delayEl.className = 'hova-pill hova-delay';
					delayEl.title = '悬停时长（点击切换）';
					delayEl.addEventListener('click', function () {
						var delays = [800, 1500, 2500, 4000];
						var idx = delays.indexOf(state.delay);
						setState({ delay: delays[(idx + 1) % delays.length] });
						renderControls();
					});
					document.body.appendChild(delayEl);
				}
			}

			function renderControls() {
				ensureControls();
				toggleEl.textContent = state.enabled ? '✦ AI知识点 开' : '· AI知识点 关';
				if (state.enabled) toggleEl.classList.add('on'); else toggleEl.classList.remove('on');
				delayEl.textContent = (state.delay / 1000) + 's';
				delayEl.style.display = state.enabled ? '' : 'none';
			}

			function cancelCountdown() {
				if (pendingCountdown) { try { pendingCountdown(); } catch (e) { /* disposed */ } pendingCountdown = null; }
				anchorKey = null;
			}

			function closePopup() {
				seq++;
				setState({ open: false, status: 'idle', error: '' });
				renderPopup();
			}

			function trigger() {
				var mySeq = ++seq;
				openAnchorX = lastX;
				openAnchorY = lastY;
				setState({ open: true, x: lastX, y: lastY, title: '', status: 'loading', error: '' });
				renderPopup();
				var settled = false;
				function settle(patch) {
					if (seq !== mySeq || settled) return;
					settled = true;
					setState(patch);
					renderPopup();
				}
				var kill = null;
				try { kill = ctx.setTimeout(function () { settle({ status: 'error', error: '知识池生成超时，请稍后再试' }); }, 30000); } catch (e) { kill = null; }
				fetch('/hover-ai/next', { cache: 'no-store' })
					.then(function (r) { return r.json(); })
					.then(function (res) {
						if (kill) { try { kill(); } catch (e) { /* ignore */ } }
						if (res && res.ok === true && typeof res.t === 'string' && typeof res.d === 'string') settle({ status: 'done', title: res.t, body: res.d });
						else settle({ status: 'error', error: (res && res.error) || '知识点获取失败' });
					})
					.catch(function (err) {
						if (kill) { try { kill(); } catch (e) { /* ignore */ } }
						settle({ status: 'error', error: '知识点获取失败: ' + String(err && err.message ? err.message : err) });
					});
			}

			function onMove(ev) {
				lastX = ev.clientX;
				lastY = ev.clientY;
				if (state.open) {
					// 弹窗打开期间：鼠标离开触发点约 3~5 厘米即自动关闭；
					// 移入弹窗本身（去点 ×、选文字）不关闭。
					var t = document.elementFromPoint(ev.clientX, ev.clientY);
					if (t && typeof t.closest === 'function' && t.closest('[data-hover-ai]')) return;
					var dx = ev.clientX - openAnchorX;
					var dy = ev.clientY - openAnchorY;
					if (dx * dx + dy * dy > MOVE_DISMISS_PX * MOVE_DISMISS_PX) closePopup();
					return;
				}
				if (!state.enabled) { cancelCountdown(); return; }
				var el = document.elementFromPoint(ev.clientX, ev.clientY);
				if (!el || typeof el.closest !== 'function') { cancelCountdown(); return; }
				if (el.closest('[data-hover-ai]')) { cancelCountdown(); return; }
				if (el.closest('input, textarea, select, [contenteditable="true"]')) { cancelCountdown(); return; }
				var found = extractTextAt(ev.clientX, ev.clientY, el);
				if (!found) { cancelCountdown(); return; }
				if (found.key === anchorKey) return;
				cancelCountdown();
				anchorKey = found.key;
				var delay = state.delay;
				pendingCountdown = ctx.setTimeout(function () {
					pendingCountdown = null;
					anchorKey = null;
					if (!state.enabled || state.open) return;
					trigger();
				}, delay);
			}

			function onDown(ev) {
				if (!state.open) return;
				var t = ev.target;
				if (t && typeof t.closest === 'function' && t.closest('[data-hover-ai]')) return;
				closePopup();
			}

			function onKey(ev) {
				if (ev.key === 'Escape' && state.open) closePopup();
			}

			document.addEventListener('mousemove', onMove, true);
			document.addEventListener('mousedown', onDown, true);
			document.addEventListener('keydown', onKey, true);

			renderControls();

			return function cleanup() {
				document.removeEventListener('mousemove', onMove, true);
				document.removeEventListener('mousedown', onDown, true);
				document.removeEventListener('keydown', onKey, true);
				cancelCountdown();
				subs.clear();
				if (popupEl) popupEl.remove();
				if (toggleEl) toggleEl.remove();
				if (delayEl) delayEl.remove();
				if (styleTag) styleTag.remove();
			};
		};

		return module.exports;
	}
});
