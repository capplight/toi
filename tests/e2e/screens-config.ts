/**
 * Screenshot specs (SCREENSHOTS=1). By default each writes its phase folder (docs/phases/F*-screens) at 360 and 1440.
 * RA Л6: `SCREENS_OUT=docs/phases/RA-screens` collects every screen of release A in one folder and adds 320 px.
 */
export const screensOut = (phase: string, fallback: string) =>
  process.env.SCREENS_OUT ? `${process.env.SCREENS_OUT}/${phase}` : fallback;

export const screenSizes = () => [
  { name: "360", width: 360, height: 740 },
  ...(process.env.SCREENS_OUT ? [{ name: "320", width: 320, height: 640 }] : []),
  { name: "1440", width: 1440, height: 900 },
];
