export const MILLISECONDS_IN_A_SECOND: number = 1000;
const SECONDS_IN_A_MINUTE: number = 60;
const MINUTES_IN_AN_HOUR: number = 60;
const HOURS_IN_A_DAY: number = 24;
const DAYS_IN_A_WEEK: number = 7;

export const MILLISECONDS_IN_A_MINUTE = MILLISECONDS_IN_A_SECOND * SECONDS_IN_A_MINUTE;
export const MILLISECONDS_IN_AN_HOUR = MILLISECONDS_IN_A_MINUTE * MINUTES_IN_AN_HOUR;
export const MILLISECONDS_IN_A_DAY = MILLISECONDS_IN_AN_HOUR * HOURS_IN_A_DAY;
const MILLISECONDS_IN_A_WEEK = MILLISECONDS_IN_A_DAY * DAYS_IN_A_WEEK;

export class TimeSpan {
  static Subtract(date1: any, date2: any) {
    return new TimeSpan(date1 - date2);
  }

  static Day(): TimeSpan {
    return new TimeSpan(MILLISECONDS_IN_A_DAY);
  }
  static Hour(): TimeSpan {
    return new TimeSpan(MILLISECONDS_IN_AN_HOUR);
  }
  static Week(): TimeSpan {
    return new TimeSpan(MILLISECONDS_IN_A_WEEK);
  }
  static Month(): TimeSpan {
    let now: any = new Date();
    let aMonthAgo: any = new Date();
    aMonthAgo.setMonth(aMonthAgo.getMonth() - 1);
    return new TimeSpan(now - aMonthAgo);
  }

  constructor(milliSeconds: number = 0) {
    this._seconds = 0;
    this._minutes = 0;
    this._hours = 0;
    this._days = 0;
    this._milliseconds = 0;
    this._totalMilliSeconds = 0;

    this.milliseconds = milliSeconds;
  }

  addTo(date: Date): Date {
    date.setMilliseconds(date.getMilliseconds() + this.totalMilliSeconds);

    return date;
  }

  subtractFrom(date: Date): Date {
    date.setMilliseconds(date.getMilliseconds() - this.totalMilliSeconds);

    return date;
  }

  private _milliseconds: number;
  private _totalMilliSeconds: number;
  private _seconds: number;
  private _minutes: number;
  private _hours: number;
  private _days: number;

  get days(): number {
    return this._days;
  }
  set days(value: number) {
    if (isNaN(value)) {
      value = 0;
    }
    this._days = value;
    this.calcMilliSeconds();
  }

  get hours(): number {
    return this._hours;
  }
  set hours(value: number) {
    if (isNaN(value)) {
      value = 0;
    }
    this._hours = value;
    this.calcMilliSeconds();
  }

  get minutes(): number {
    return this._minutes;
  }
  set minutes(value: number) {
    if (isNaN(value)) {
      value = 0;
    }
    this._minutes = value;
    this.calcMilliSeconds();
  }

  get seconds(): number {
    return this._seconds;
  }
  set seconds(value: number) {
    this._seconds = value;
    this.calcMilliSeconds();
  }

  get milliseconds(): number {
    return this._milliseconds;
  }
  set milliseconds(value: number) {
    if (isNaN(value)) {
      value = 0;
    }
    this._milliseconds = value;
    this.calcMilliSeconds();
  }

  get totalMilliSeconds() {
    return this._totalMilliSeconds;
  }

  get totalSeconds() {
    let seconds = this._totalMilliSeconds / MILLISECONDS_IN_A_SECOND;
    return this._totalMilliSeconds > 0 ? Math.floor(seconds) : Math.trunc(seconds);
  }

  get totalMinutes() {
    let minutes = this._totalMilliSeconds / MILLISECONDS_IN_A_MINUTE;
    return this._totalMilliSeconds > 0 ? Math.floor(minutes) : Math.trunc(minutes);
  }

  get totalHours() {
    let hours = this._totalMilliSeconds / MILLISECONDS_IN_AN_HOUR;
    return this._totalMilliSeconds > 0 ? Math.floor(hours) : Math.trunc(hours);
  }

  floorValue(origValue: number, maxValue: number) {
    let value = origValue / maxValue;
    return {
      modulo: origValue % maxValue,
      addition: origValue > 0 ? Math.floor(value) : Math.trunc(value),
    };
  }

  calcMilliSeconds() {
    let newMilliSecond = this.floorValue(this._milliseconds, MILLISECONDS_IN_A_SECOND);
    this._milliseconds = newMilliSecond.modulo;
    this._seconds += newMilliSecond.addition;

    let newSecond = this.floorValue(this._seconds, SECONDS_IN_A_MINUTE);
    this._seconds = newSecond.modulo;
    this._minutes += newSecond.addition;

    let newminutes = this.floorValue(this._minutes, MINUTES_IN_AN_HOUR);
    this._minutes = newminutes.modulo;
    this._hours += newminutes.addition;

    let newDays = this.floorValue(this._hours, HOURS_IN_A_DAY);
    this._hours = newDays.modulo;
    this._days += newDays.addition;

    this._totalMilliSeconds =
      this.days * MILLISECONDS_IN_A_DAY +
      this.hours * MILLISECONDS_IN_AN_HOUR +
      this.minutes * MILLISECONDS_IN_A_MINUTE +
      this.seconds * MILLISECONDS_IN_A_SECOND +
      this.milliseconds;
  }
}
