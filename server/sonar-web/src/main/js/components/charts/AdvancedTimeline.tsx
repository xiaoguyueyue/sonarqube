/*
 * SonarQube
 * Copyright (C) 2009-2023 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
import classNames from 'classnames';
import { bisector, extent, max } from 'd3-array';
import {
  NumberValue,
  ScaleLinear,
  scaleLinear,
  ScalePoint,
  scalePoint,
  scaleTime,
  ScaleTime,
} from 'd3-scale';
import { area, curveBasis, line as d3Line } from 'd3-shape';
import { flatten, isEqual, sortBy, throttle, uniq } from 'lodash';
import * as React from 'react';
import { colors, rawSizes } from '../../app/theme';
import { isDefined } from '../../helpers/types';
import { Chart } from '../../types/types';
import './AdvancedTimeline.css';
import './LineChart.css';

export interface Props {
  graphDescription?: string;
  basisCurve?: boolean;
  endDate?: Date;
  disableZoom?: boolean;
  displayNewCodeLegend?: boolean;
  formatYTick?: (tick: number | string) => string;
  hideGrid?: boolean;
  hideXAxis?: boolean;
  height: number;
  width: number;
  leakPeriodDate?: Date;
  // used to avoid same y ticks labels
  maxYTicksCount: number;
  metricType: string;
  padding: number[];
  selectedDate?: Date;
  series: Chart.Serie[];
  showAreas?: boolean;
  startDate?: Date;
  updateSelectedDate?: (selectedDate?: Date) => void;
  updateTooltip?: (selectedDate?: Date, tooltipXPos?: number, tooltipIdx?: number) => void;
  updateZoom?: (start?: Date, endDate?: Date) => void;
  zoomSpeed: number;
}

type XScale = ScaleTime<number, number>;
type YScale = ScaleLinear<number, number> | ScalePoint<number | string>;
type YPoint = (number | string) & NumberValue;

const LEGEND_LINE_HEIGHT = 16;
const X_LABEL_OFFSET = 15;

interface State {
  leakLegendTextWidth?: number;
  maxXRange: number[];
  mouseOver?: boolean;
  selectedDate?: Date;
  selectedDateXPos?: number;
  selectedDateIdx?: number;
  yScale: YScale;
  xScale: XScale;
}

export default class AdvancedTimeline extends React.PureComponent<Props, State> {
  static defaultProps = {
    eventSize: 8,
    maxYTicksCount: 4,
    padding: [26, 10, 50, 60],
    zoomSpeed: 1,
  };

  constructor(props: Props) {
    super(props);
    const scales = this.getScales(props);
    const selectedDatePos = this.getSelectedDatePos(scales.xScale, props.selectedDate);
    this.state = { ...scales, ...selectedDatePos };
    this.updateTooltipPos = throttle(this.updateTooltipPos, 40);
    this.handleZoomUpdate = throttle(this.handleZoomUpdate, 40);
  }

  componentDidUpdate(prevProps: Props) {
    let scales;
    let selectedDatePos;
    if (
      this.props.metricType !== prevProps.metricType ||
      this.props.startDate !== prevProps.startDate ||
      this.props.endDate !== prevProps.endDate ||
      this.props.width !== prevProps.width ||
      this.props.padding !== prevProps.padding ||
      this.props.height !== prevProps.height ||
      this.props.series !== prevProps.series
    ) {
      scales = this.getScales(this.props);
      if (this.state.selectedDate != null) {
        selectedDatePos = this.getSelectedDatePos(scales.xScale, this.state.selectedDate);
      }
    }

    if (!isEqual(this.props.selectedDate, prevProps.selectedDate)) {
      const xScale = scales ? scales.xScale : this.state.xScale;
      selectedDatePos = this.getSelectedDatePos(xScale, this.props.selectedDate);
    }

    if (scales || selectedDatePos) {
      if (scales) {
        this.setState({ ...scales });
      }
      if (selectedDatePos) {
        this.setState({ ...selectedDatePos });
      }

      if (selectedDatePos && this.props.updateTooltip) {
        this.props.updateTooltip(
          selectedDatePos.selectedDate,
          selectedDatePos.selectedDateXPos,
          selectedDatePos.selectedDateIdx
        );
      }
    }
  }

  getRatingScale = (availableHeight: number) => {
    return scalePoint<number>().domain([5, 4, 3, 2, 1]).range([availableHeight, 0]);
  };

  getLevelScale = (availableHeight: number) => {
    return scalePoint().domain(['ERROR', 'WARN', 'OK']).range([availableHeight, 0]);
  };

  getYScale = (props: Props, availableHeight: number, flatData: Chart.Point[]): YScale => {
    if (props.metricType === 'RATING') {
      return this.getRatingScale(availableHeight);
    } else if (props.metricType === 'LEVEL') {
      return this.getLevelScale(availableHeight);
    }
    return scaleLinear()
      .range([availableHeight, 0])
      .domain([0, max(flatData, (d) => Number(d.y || 0)) || 1])
      .nice();
  };

  isYScaleLinear(yScale: YScale): yScale is ScaleLinear<number, number> {
    return 'ticks' in yScale;
  }

  getXScale = ({ startDate, endDate }: Props, availableWidth: number, flatData: Chart.Point[]) => {
    const dateRange = extent(flatData, (d) => d.x) as [Date, Date];
    const start = startDate && startDate > dateRange[0] ? startDate : dateRange[0];
    const end = endDate && endDate < dateRange[1] ? endDate : dateRange[1];
    const xScale: ScaleTime<number, number> = scaleTime()
      .domain(sortBy([start, end]))
      .range([0, availableWidth])
      .clamp(false);
    return {
      xScale,
      maxXRange: dateRange.map(xScale),
    };
  };

  getScales = (props: Props) => {
    const availableWidth = props.width - props.padding[1] - props.padding[3];
    const availableHeight = props.height - props.padding[0] - props.padding[2];
    const flatData = flatten(props.series.map((serie) => serie.data));
    return {
      ...this.getXScale(props, availableWidth, flatData),
      yScale: this.getYScale(props, availableHeight, flatData),
    };
  };

  getSelectedDatePos = (xScale: XScale, selectedDate?: Date) => {
    const firstSerie = this.props.series[0];
    if (selectedDate && firstSerie) {
      const idx = firstSerie.data.findIndex((p) => p.x.valueOf() === selectedDate.valueOf());
      const xRange = sortBy(xScale.range());
      const xPos = xScale(selectedDate);
      if (idx >= 0 && xPos >= xRange[0] && xPos <= xRange[1]) {
        return {
          selectedDate,
          selectedDateXPos: xScale(selectedDate),
          selectedDateIdx: idx,
        };
      }
    }
    return { selectedDate: undefined, selectedDateXPos: undefined, selectedDateIdx: undefined };
  };

  getEventMarker = (size: number) => {
    const half = size / 2;
    return `M${half} 0 L${size} ${half} L ${half} ${size} L0 ${half} L${half} 0 L${size} ${half}`;
  };

  handleWheel = (event: React.WheelEvent<SVGElement>) => {
    event.preventDefault();
    const { maxXRange, xScale } = this.state;
    const parentBbox = event.currentTarget.getBoundingClientRect();
    const mouseXPos = (event.pageX - parentBbox.left) / parentBbox.width;
    const xRange = xScale.range();

    const speed = event.deltaMode
      ? (25 / event.deltaMode) * this.props.zoomSpeed
      : this.props.zoomSpeed;
    const leftPos = xRange[0] - Math.round(speed * event.deltaY * mouseXPos);
    const rightPos = xRange[1] + Math.round(speed * event.deltaY * (1 - mouseXPos));
    const startDate = leftPos > maxXRange[0] ? xScale.invert(leftPos) : undefined;
    const endDate = rightPos < maxXRange[1] ? xScale.invert(rightPos) : undefined;
    this.handleZoomUpdate(startDate, endDate);
  };

  handleZoomUpdate = (startDate?: Date, endDate?: Date) => {
    if (this.props.updateZoom) {
      this.props.updateZoom(startDate, endDate);
    }
  };

  handleMouseMove = (event: React.MouseEvent<SVGElement>) => {
    const parentBbox = event.currentTarget.getBoundingClientRect();
    this.updateTooltipPos(event.pageX - parentBbox.left);
  };

  handleMouseEnter = () => {
    this.setState({ mouseOver: true });
  };

  handleMouseOut = () => {
    const { updateTooltip } = this.props;
    if (updateTooltip) {
      this.setState({
        mouseOver: false,
        selectedDate: undefined,
        selectedDateXPos: undefined,
        selectedDateIdx: undefined,
      });
      updateTooltip(undefined, undefined, undefined);
    }
  };

  handleClick = () => {
    const { updateSelectedDate } = this.props;
    if (updateSelectedDate) {
      updateSelectedDate(this.state.selectedDate || undefined);
    }
  };

  setLeakLegendTextWidth = (node: SVGTextElement | null) => {
    if (node) {
      this.setState({ leakLegendTextWidth: node.getBoundingClientRect().width });
    }
  };

  updateTooltipPos = (xPos: number) => {
    this.setState((state) => {
      const firstSerie = this.props.series[0];
      if (state.mouseOver && firstSerie) {
        const { updateTooltip } = this.props;
        const date = state.xScale.invert(xPos);
        const bisectX = bisector<Chart.Point, Date>((d) => d.x).right;
        let idx = bisectX(firstSerie.data, date);
        if (idx >= 0) {
          const previousPoint = firstSerie.data[idx - 1];
          const nextPoint = firstSerie.data[idx];
          if (
            !nextPoint ||
            (previousPoint &&
              date.valueOf() - previousPoint.x.valueOf() <= nextPoint.x.valueOf() - date.valueOf())
          ) {
            idx--;
          }
          const selectedDate = firstSerie.data[idx].x;
          const xPos = state.xScale(selectedDate);
          if (updateTooltip) {
            updateTooltip(selectedDate, xPos, idx);
          }
          return { selectedDate, selectedDateXPos: xPos, selectedDateIdx: idx };
        }
      }
      return null;
    });
  };

  renderHorizontalGrid = () => {
    const { formatYTick } = this.props;
    const { xScale, yScale } = this.state;
    const hasTicks = this.isYScaleLinear(yScale);

    let ticks: Array<string | number> = hasTicks
      ? yScale.ticks(this.props.maxYTicksCount)
      : yScale.domain();

    if (!ticks.length) {
      ticks.push(yScale.domain()[1]);
    }

    // if there are duplicated ticks, that means 4 ticks are too much for this data
    // so let's just use the domain values (min and max)
    if (formatYTick) {
      const formattedTicks = ticks.map((tick) => formatYTick(tick));
      if (ticks.length > uniq(formattedTicks).length) {
        ticks = yScale.domain();
      }
    }

    return (
      <g>
        {ticks.map((tick) => {
          const y = yScale(tick as YPoint);
          return (
            <g key={tick}>
              {formatYTick != null && (
                <text
                  className="line-chart-tick line-chart-tick-x"
                  dx="-1em"
                  dy="0.3em"
                  textAnchor="end"
                  x={xScale.range()[0]}
                  y={y}
                >
                  {formatYTick(tick)}
                </text>
              )}
              <line
                className="line-chart-grid"
                x1={xScale.range()[0]}
                x2={xScale.range()[1]}
                y1={y}
                y2={y}
              />
            </g>
          );
        })}
      </g>
    );
  };

  renderXAxisTicks = () => {
    const { xScale, yScale } = this.state;
    const format = xScale.tickFormat(7);
    const ticks = xScale.ticks(7);
    const y = yScale.range()[0];
    return (
      <g transform="translate(0, 20)">
        {ticks.slice(0, -1).map((tick, index) => {
          const x = xScale(tick);
          return (
            <text
              className="line-chart-tick"
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              textAnchor="end"
              transform={`rotate(-35, ${x + X_LABEL_OFFSET}, ${y})`}
              x={x + X_LABEL_OFFSET}
              y={y}
            >
              {format(tick)}
            </text>
          );
        })}
      </g>
    );
  };

  renderNewCodeLegend = (params: { leakStart: number; leakWidth: number }) => {
    const { leakStart, leakWidth } = params;
    const { leakLegendTextWidth, xScale, yScale } = this.state;
    const yRange = yScale.range();
    const xRange = xScale.range();

    const legendMinWidth = (leakLegendTextWidth ?? 0) + rawSizes.grid;
    const legendPadding = rawSizes.grid / 2;

    let legendBackgroundPosition;
    let legendBackgroundWidth;
    let legendMargin;
    let legendPosition;
    let legendTextAnchor;

    if (leakWidth >= legendMinWidth) {
      legendBackgroundWidth = leakWidth;
      legendBackgroundPosition = leakStart;
      legendMargin = 0;
      legendPosition = legendBackgroundPosition + legendPadding;
      legendTextAnchor = 'start';
    } else {
      legendBackgroundWidth = legendMinWidth;
      legendBackgroundPosition = xRange[xRange.length - 1] - legendBackgroundWidth;
      legendMargin = rawSizes.grid / 2;
      legendPosition = xRange[xRange.length - 1] - legendPadding;
      legendTextAnchor = 'end';
    }

    return (
      <>
        <rect
          fill={colors.leakPrimaryColor}
          height={LEGEND_LINE_HEIGHT}
          width={legendBackgroundWidth}
          x={legendBackgroundPosition}
          y={yRange[yRange.length - 1] - LEGEND_LINE_HEIGHT - legendMargin}
        />
        <text
          className="new-code-legend"
          ref={this.setLeakLegendTextWidth}
          x={legendPosition}
          y={yRange[yRange.length - 1] - legendPadding - legendMargin}
          textAnchor={legendTextAnchor}
        >
          new code
        </text>
      </>
    );
  };

  renderLeak = () => {
    const { displayNewCodeLegend, leakPeriodDate } = this.props;
    if (!leakPeriodDate) {
      return null;
    }
    const { xScale, yScale } = this.state;
    const yRange = yScale.range();
    const xRange = xScale.range();

    // truncate leak to start of chart to prevent weird visual artifacts when too far left
    // (occurs when leak starts a long time before first analysis)
    const leakStart = Math.max(xScale(leakPeriodDate), xRange[0]);

    const leakWidth = xRange[xRange.length - 1] - leakStart;
    if (leakWidth < 1) {
      return null;
    }

    return (
      <>
        {displayNewCodeLegend && this.renderNewCodeLegend({ leakStart, leakWidth })}
        <rect
          className="leak-chart-rect"
          fill={colors.leakPrimaryColor}
          height={yRange[0] - yRange[yRange.length - 1]}
          width={leakWidth}
          x={leakStart}
          y={yRange[yRange.length - 1]}
        />
      </>
    );
  };

  renderLines = () => {
    const { xScale, yScale } = this.state;

    const lineGenerator = d3Line<Chart.Point>()
      .defined((d) => Boolean(d.y || d.y === 0))
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y as YPoint) as number);

    if (this.props.basisCurve) {
      lineGenerator.curve(curveBasis);
    }
    return (
      <g>
        {this.props.series.map((serie, idx) => (
          <path
            className={classNames('line-chart-path', `line-chart-path-${idx}`)}
            d={lineGenerator(serie.data) ?? undefined}
            key={serie.name}
          />
        ))}
      </g>
    );
  };

  renderDots = () => {
    const { series } = this.props;
    const { xScale, yScale } = this.state;
    return (
      <g>
        {series
          .map((serie, serieIdx) =>
            serie.data
              .map((point, idx) => {
                const pointNotDefined = !point.y && point.y !== 0;
                const hasPointBefore =
                  serie.data[idx - 1] && (serie.data[idx - 1].y || serie.data[idx - 1].y === 0);
                const hasPointAfter =
                  serie.data[idx + 1] && (serie.data[idx + 1].y || serie.data[idx + 1].y === 0);
                if (pointNotDefined || hasPointBefore || hasPointAfter) {
                  return undefined;
                }
                return (
                  <circle
                    className={classNames('line-chart-dot', `line-chart-dot-${serieIdx}`)}
                    cx={xScale(point.x)}
                    cy={yScale(point.y as YPoint)}
                    key={`${serie.name}${idx}`}
                    r="2"
                  />
                );
              })
              .filter(isDefined)
          )
          .filter((dots) => dots.length > 0)}
      </g>
    );
  };

  renderAreas = () => {
    const { series, basisCurve } = this.props;
    const { xScale, yScale } = this.state;

    const areaGenerator = area<Chart.Point>()
      .defined((d) => Boolean(d.y || d.y === 0))
      .x((d) => xScale(d.x))
      .y1((d) => yScale(d.y as YPoint) as number)
      .y0(yScale(0) as number);

    if (basisCurve) {
      areaGenerator.curve(curveBasis);
    }
    return (
      <g>
        {series.map((serie, idx) => (
          <path
            className={classNames('line-chart-area', `line-chart-area-${idx}`)}
            d={areaGenerator(serie.data) ?? undefined}
            key={serie.name}
          />
        ))}
      </g>
    );
  };

  renderSelectedDate = () => {
    const { selectedDateIdx, selectedDateXPos, yScale } = this.state;
    const firstSerie = this.props.series[0];
    if (selectedDateIdx == null || selectedDateXPos == null || !firstSerie) {
      return null;
    }

    return (
      <g>
        <line
          className="line-tooltip"
          x1={selectedDateXPos}
          x2={selectedDateXPos}
          y1={yScale.range()[0]}
          y2={yScale.range()[1]}
        />
        {this.props.series.map((serie, idx) => {
          const point = serie.data[selectedDateIdx];
          if (!point || (!point.y && point.y !== 0)) {
            return null;
          }
          return (
            <circle
              className={classNames('line-chart-dot', `line-chart-dot-${idx}`)}
              cx={selectedDateXPos}
              cy={yScale(point.y as YPoint)}
              key={serie.name}
              r="4"
            />
          );
        })}
      </g>
    );
  };

  renderClipPath = () => {
    const { yScale, xScale } = this.state;

    return (
      <defs>
        <clipPath id="chart-clip">
          <rect
            height={yScale.range()[0] + 10}
            transform="translate(0,-5)"
            width={xScale.range()[1]}
          />
        </clipPath>
      </defs>
    );
  };

  renderMouseEventsOverlay = (zoomEnabled: boolean) => {
    const { yScale, xScale } = this.state;

    const mouseEvents: Partial<React.SVGProps<SVGRectElement>> = {};
    if (zoomEnabled) {
      mouseEvents.onWheel = this.handleWheel;
    }
    if (this.props.updateTooltip) {
      mouseEvents.onMouseEnter = this.handleMouseEnter;
      mouseEvents.onMouseMove = this.handleMouseMove;
      mouseEvents.onMouseOut = this.handleMouseOut;
    }
    if (this.props.updateSelectedDate) {
      mouseEvents.onClick = this.handleClick;
    }
    return (
      <rect
        className="chart-mouse-events-overlay"
        height={yScale.range()[0]}
        width={xScale.range()[1]}
        {...mouseEvents}
      />
    );
  };

  render() {
    const {
      width,
      height,
      padding,
      disableZoom,
      startDate,
      endDate,
      leakPeriodDate,
      hideGrid,
      hideXAxis,
      showAreas,
      graphDescription,
    } = this.props;
    if (!width || !height) {
      return <div />;
    }
    const zoomEnabled = !disableZoom && this.props.updateZoom != null;
    const isZoomed = Boolean(startDate ?? endDate);
    return (
      <svg
        aria-label={graphDescription}
        className={classNames('line-chart', { 'chart-zoomed': isZoomed })}
        height={height}
        width={width}
      >
        {zoomEnabled && this.renderClipPath()}
        <g transform={`translate(${padding[3]}, ${padding[0]})`}>
          {leakPeriodDate != null && this.renderLeak()}
          {!hideGrid && this.renderHorizontalGrid()}
          {!hideXAxis && this.renderXAxisTicks()}
          {showAreas && this.renderAreas()}
          {this.renderLines()}
          {this.renderDots()}
          {this.renderSelectedDate()}
          {this.renderMouseEventsOverlay(zoomEnabled)}
        </g>
      </svg>
    );
  }
}
