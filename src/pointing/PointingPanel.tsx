import { PointingConfig, PointingScrollConfig } from "../saveFormat";

interface PointingPanelProps {
  config: PointingConfig;
  onChange: (config: PointingConfig) => void;
}

const clampPercent = (value: number) =>
  Math.min(300, Math.max(10, Math.round(value / 10) * 10));

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
};

const percentToScale = (percent: number): [number, number] => {
  const value = clampPercent(percent);
  const divisor = gcd(value, 100);
  return [value / divisor, 100 / divisor];
};

const percentFromScale = (scale: [number, number]) => {
  if (!scale[1]) {
    return 100;
  }
  const rawPercent = (scale[0] / scale[1]) * 100;
  return clampPercent(rawPercent || 100);
};

const PointingPanel = ({ config, onChange }: PointingPanelProps) => {
  const cursorPercent = percentFromScale(config.cursor.scale);
  const scrollConfig: PointingScrollConfig =
    config.scroll ?? {
      mode: "mapper",
      scale: [1, 20],
    };
  const scrollPercent = percentFromScale(scrollConfig.scale);

  const updateCursorPercent = (value: number) => {
    onChange({
      ...config,
      cursor: {
        ...config.cursor,
        scale: percentToScale(value),
      },
    });
  };

  const updateCursorCpi = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      onChange({
        ...config,
        cursor: {
          ...config.cursor,
          cpi: null,
        },
      });
      return;
    }
    const parsed = Number(trimmed);
    onChange({
      ...config,
      cursor: {
        ...config.cursor,
        cpi: Number.isNaN(parsed) ? null : parsed,
      },
    });
  };

  const updateScrollPercent = (value: number) => {
    onChange({
      ...config,
      scroll: {
        ...scrollConfig,
        scale: percentToScale(value),
      },
    });
  };

  return (
    <section className="bg-base-100 rounded p-3 shadow-inner border border-base-200">
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-content/80">
          Trackball sensitivity
        </h2>
        <p className="text-xs text-base-content/60">
          Adjust cursor and scroll scaling without using layer overrides.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <label className="form-control">
          <span className="label-text text-xs uppercase">
            Cursor sensitivity ({cursorPercent}%)
          </span>
          <input
            type="range"
            className="range range-xs"
            min={10}
            max={300}
            step={10}
            value={cursorPercent}
            onChange={(event) => updateCursorPercent(Number(event.target.value))}
          />
          <div className="flex justify-between text-[0.7rem] text-base-content/60 mt-1">
            <span>10%</span>
            <span>150%</span>
            <span>300%</span>
          </div>
        </label>

        <label className="form-control md:w-1/2">
          <span className="label-text text-xs uppercase">Sensor CPI</span>
          <input
            type="number"
            min={0}
            className="input input-sm input-bordered"
            value={config.cursor.cpi ?? ""}
            onChange={(event) => updateCursorCpi(event.target.value)}
            placeholder="1000"
          />
        </label>

        <div className="divider text-xs">Scroll mapping</div>

        <label className="form-control">
          <span className="label-text text-xs uppercase">
            Scroll sensitivity ({scrollPercent}%)
          </span>
          <input
            type="range"
            className="range range-xs"
            min={10}
            max={300}
            step={10}
            value={scrollPercent}
            onChange={(event) =>
              updateScrollPercent(Number(event.target.value))
            }
          />
          <div className="flex justify-between text-[0.7rem] text-base-content/60 mt-1">
            <span>10%</span>
            <span>150%</span>
            <span>300%</span>
          </div>
        </label>
      </div>
    </section>
  );
};

export default PointingPanel;
