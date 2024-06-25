export function formatDateServiceNow(dateString) {
  const date = new Date(dateString);
  const isoString = date.toISOString();
  const formattedDate = isoString.replace("T", " ").replace("Z", "");

  return formattedDate;
}

export function calculateDuration(start_date, end_date) {
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);

  // Calculate the difference in milliseconds
  const durationInMillis = endDate - startDate;

  // Calculate the duration in days, hours, minutes, and seconds
  const days = Math.floor(durationInMillis / (24 * 60 * 60 * 1000));
  let remainingMillis = durationInMillis % (24 * 60 * 60 * 1000);
  const hours = Math.floor(remainingMillis / (60 * 60 * 1000));
  remainingMillis = remainingMillis % (60 * 60 * 1000);
  const minutes = Math.floor(remainingMillis / (60 * 1000));
  const seconds = Math.floor((remainingMillis % (60 * 1000)) / 1000);

  // Format the duration string
  function pad(n) {
    return n < 10 ? "0" + n : n;
  }
  const durationString =
    pad(days) + " " + pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);

  return durationString;
}

export const bryntumTaskFieldsToServiceNowFields = {
  name: "short_description",
  startDate: "start_date",
  endDate: "end_date",
  parentId: "parent",
  duration: "duration",
  parentIndex: "wbs_order",
  percentDone: "percent_complete",
  note: "description",
  status: "status",
  override_status: "override_status",
};

export function calcStartDate(endDate, duration, durationUnit = "day") {
  const startDate = new Date(endDate);

  // Adjust the date based on the duration unit
  switch (durationUnit) {
    case "millisecond":
      startDate.setMilliseconds(startDate.getMilliseconds() - duration);
      break;
    case "second":
      startDate.setSeconds(startDate.getSeconds() - duration);
      break;
    case "minute":
      startDate.setMinutes(startDate.getMinutes() - duration);
      break;
    case "hour":
      startDate.setHours(startDate.getHours() - duration);
      break;
    case "day":
      startDate.setDate(startDate.getDate() - duration);
      break;
    case "week":
      startDate.setDate(startDate.getDate() - duration * 7);
      break;
    case "month":
      startDate.setMonth(startDate.getMonth() - duration);
      break;
    case "quarter":
      startDate.setMonth(startDate.getMonth() - duration * 3);
      break;
    case "year":
      startDate.setFullYear(startDate.getFullYear() - duration);
      break;
    default:
      throw new Error("Invalid duration unit");
  }

  return startDate.toISOString();
}

export function serviceNowDepTypeToBryntumDepType(sub_type) {
  switch (sub_type) {
    case "fs":
      return 2;
    case "ss":
      return 0;
    case "ff":
      return 1;
    case "sf":
      return 3;
    default:
      throw new Error("Invalid dependency type");
  }
}

export function serviceNowDepLagToBryntumDepLag(depLag) {
  // Check if the depLag is the default value "1970-01-01 00:00:00"
  if (depLag === "1970-01-01 00:00:00") {
    return { lag: 0, lagUnit: "d" }; // Default to 0 lag in days if no lag is present
  }

  const lagDate = new Date(depLag);

  const totalMillis = lagDate.getTime();

  // Define the time units in milliseconds
  const timeUnits = {
    ms: 1,
    s: 1000,
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
    w: 1000 * 60 * 60 * 24 * 7,
    M: 1000 * 60 * 60 * 24 * 30.44, // Approximate month length
    y: 1000 * 60 * 60 * 24 * 365.25, // Approximate year length
  };

  // Determine the most appropriate unit
  let lag, lagUnit;

  if (totalMillis < timeUnits.s) {
    lag = totalMillis / timeUnits.ms;
    lagUnit = "ms";
  } else if (totalMillis < timeUnits.m) {
    lag = totalMillis / timeUnits.s;
    lagUnit = "s";
  } else if (totalMillis < timeUnits.h) {
    lag = totalMillis / timeUnits.m;
    lagUnit = "m";
  } else if (totalMillis < timeUnits.d) {
    lag = totalMillis / timeUnits.h;
    lagUnit = "h";
  } else if (totalMillis < timeUnits.w) {
    lag = totalMillis / timeUnits.d;
    lagUnit = "d";
  } else if (totalMillis < timeUnits.M) {
    lag = totalMillis / timeUnits.w;
    lagUnit = "w";
  } else if (totalMillis < timeUnits.y) {
    lag = totalMillis / timeUnits.M;
    lagUnit = "M";
  } else {
    lag = totalMillis / timeUnits.y;
    lagUnit = "y";
  }

  return { lag: Math.round(lag * 100) / 100, lagUnit }; // Round to two decimal places
}

export function bryntumGanttDepLagToServiceNowDepLag(lag, lagUnit) {
  // Define the base date (January 1, 1970, 00:00:00)
  const baseDate = new Date(0); // This represents the Unix epoch start

  // Calculate the total duration in milliseconds based on lag and lagUnit
  let durationMillis;
  console.log({ lagUnit });
  switch (lagUnit) {
    case "ms":
    case "millisecond":
      durationMillis = lag;
      break;
    case "s":
    case "second":
      durationMillis = lag * 1000;
      break;
    case "m":
    case "minute":
      durationMillis = lag * 1000 * 60;
      break;
    case "h":
    case "hour":
      durationMillis = lag * 1000 * 60 * 60;
      break;
    case "d":
    case "day":
      durationMillis = lag * 1000 * 60 * 60 * 24;
      break;
    case "w":
    case "week":
      durationMillis = lag * 1000 * 60 * 60 * 24 * 7;
      break;
    case "M":
    case "month":
      durationMillis = lag * 1000 * 60 * 60 * 24 * 30.44; // Approximate month length
      break;
    case "y":
    case "year":
      durationMillis = lag * 1000 * 60 * 60 * 24 * 365.25; // Approximate year length
      break;
    default:
      throw new Error("Invalid lagUnit");
  }

  // Calculate the new date by adding the duration to the base date
  const newDate = new Date(baseDate.getTime() + durationMillis);

  // Format the new date as a GlideDuration value (YYYY-MM-DD HH:MM:SS)
  const formattedLag = `${newDate.getUTCFullYear()}-${String(
    newDate.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(newDate.getUTCDate()).padStart(2, "0")} ${String(
    newDate.getUTCHours()
  ).padStart(2, "0")}:${String(newDate.getUTCMinutes()).padStart(
    2,
    "0"
  )}:${String(newDate.getUTCSeconds()).padStart(2, "0")}`;

  return formattedLag;
}

export function bryntumDepTypeToServiceNowDepType(type) {
  switch (type) {
    case 2:
      return "fs";
    case 0:
      return "ss";
    case 1:
      return "ff";
    case 3:
      return "sf";
    default:
      throw new Error("Invalid dependency type");
  }
}

export const bryntumDependencyFieldsToServiceNowFields = {
  fromEvent: "parent",
  toEvent: "child",
};