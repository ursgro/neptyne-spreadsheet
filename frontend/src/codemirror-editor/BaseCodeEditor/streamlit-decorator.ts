import { WidgetType } from "@codemirror/view";

export class LaunchButtonWidget extends WidgetType {
  constructor(readonly onClick: () => void) {
    super();
  }

  eq(other: LaunchButtonWidget) {
    return other.onClick === this.onClick;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.onclick = this.onClick;
    wrap.setAttribute("aria-hidden", "true");
    wrap.className = "streamlit-launch";
    const icon = document.createElement("span");
    icon.appendChild(document.createTextNode("▶️"));
    icon.className = "streamlit-launch-icon";
    const text = document.createElement("span");
    text.appendChild(document.createTextNode("Open Streamlit App"));
    text.className = "streamlit-launch-text";
    wrap.appendChild(icon);
    wrap.appendChild(text);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}
