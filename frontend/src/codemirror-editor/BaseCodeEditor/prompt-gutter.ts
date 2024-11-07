import { gutter, GutterMarker } from "@codemirror/view";

class ClickableMarker extends GutterMarker {
  label: string;
  onClick: () => void;
  cssClass?: string;

  constructor(label: string, onClick: () => void, cssClass?: string) {
    super();
    this.label = label;
    this.onClick = onClick;
    this.cssClass = cssClass;
  }

  toDOM() {
    const div = document.createElement("div");
    div.textContent = this.label;
    div.onclick = this.onClick;
    const classNames = ["prompt-gutter"];
    if (this.cssClass) {
      classNames.push(`prompt-gutter-${this.cssClass}`);
    }
    div.className = classNames.join(" ");
    return div;
  }
}

class BusyMarker extends GutterMarker {
  toDOM() {
    const div = document.createElement("div");
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.textContent = ".";
      dot.className = "prompt-gutter-busy-dot prompt-gutter-busy-dot-" + i;
      div.appendChild(dot);
    }
    div.className = "prompt-gutter-busy";
    return div;
  }
}

export const busyGutter = gutter({
  lineMarker: (view, line) => {
    return new BusyMarker();
  },
});

export const promptGutter = (label: string, onClick: () => void, cssClass?: string) =>
  gutter({
    lineMarker: (view, line) => {
      const theLabel = line.from === 0 ? label : "...";
      return new ClickableMarker(theLabel, onClick, cssClass);
    },
  });
