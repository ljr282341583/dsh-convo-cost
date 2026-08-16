// dsh-convo-cost browser half: mounts a "本对话费用" line into the
// conversation composer dock, reading the host's `convoCost` projection.
// Hand-written in the DSH client bundle format (no build step required).
window.__ModuleLoader__.load({
	id: "dsh-convo-cost",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const STYLE = {
			boxSizing: "border-box",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: "12px",
			fontVariantNumeric: "tabular-nums",
			lineHeight: "20px",
			padding: "4px 0 0",
			whiteSpace: "nowrap",
			cursor: "default"
		};

		/** 1234 -> 1.2k, 12345678 -> 12.35M */
		function fmtTok(n) {
			if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
			return String(Math.round(n));
		}

		function detailTitle(d) {
			const lines = [
				"本对话费用统计",
				"调用 " + d.calls + " 次",
				"输入 " + fmtTok(d.inputTokens + d.cacheReadTokens) + " tok（缓存命中 " + fmtTok(d.cacheReadTokens) + "）",
				"输出 " + fmtTok(d.outputTokens) + " tok（其中推理 " + fmtTok(d.reasoningTokens) + "）",
				"≈ $" + d.costUsd.toFixed(4) + " / ¥" + d.costCny.toFixed(2),
				"计价：" + (d.period === "peakValley" ? "峰谷价" : "基础价") + " · 模型：" + (d.model || "?")
			];
			return lines.join("  ");
		}

		const ConvoCostLine = react.memo(function ConvoCostLine({ useProjection }) {
			const d = useProjection("convoCost");
			let label = "本对话费用 —";
			let title = "本对话费用统计：等待首次模型调用…";
			if (d !== undefined && d !== null && d.calls > 0) {
				const total = d.inputTokens + d.cacheReadTokens + d.outputTokens;
				label = "本对话 ¥" + d.costCny.toFixed(2) + " · " + fmtTok(total) + " tok";
				title = detailTitle(d);
			}
			return react.createElement("div", { "data-dsh-convo-cost": true, style: STYLE, title }, label);
		});

		const DockEntry = react.memo(function DockEntry(props) {
			return react.createElement(ConvoCostLine, { useProjection: props.useProjection });
		});

		/** Client services required by this plugin. */
		const inject = ["slots", "locale", "connection"];

		/** Register the dock line. */
		function apply(ctx) {
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "dsh-convo-cost",
				order: 101,
				inject: () => ({})
			}, DockEntry));
		}

		exports.ConvoCostLine = ConvoCostLine;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
