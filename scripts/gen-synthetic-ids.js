const { createCanvas, registerFont } = require("@napi-rs/canvas");
const fs = require("fs");

function drawTextOutlined(ctx, text, x, y, size, color = "black") {
  ctx.font = `${size}px Arial`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

function makeDriverLicense(out) {
  const w = 900, h = 560;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#e8eef5";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#123c7a";
  ctx.fillRect(0, 0, w, 90);
  ctx.fillStyle = "#123c7a";
  ctx.fillRect(0, h - 40, w, 40);
  drawTextOutlined(ctx, "STATE OF CALIFORNIA", 40, 62, 40, "white");
  drawTextOutlined(ctx, "DRIVER LICENSE", 470, 62, 34, "white");
  ctx.strokeStyle = "#123c7a";
  ctx.strokeRect(14, 100, w - 28, h - 150);
  drawTextOutlined(ctx, "NAME: JOHN A. DOE", 60, 200, 26);
  drawTextOutlined(ctx, "DOB: 05/14/1990", 60, 260, 26);
  drawTextOutlined(ctx, "EXP: 05/14/2030", 60, 320, 26);
  drawTextOutlined(ctx, "DL: D1234567", 60, 380, 26);
  drawTextOutlined(ctx, "SEX: M  HGT: 6-00", 470, 200, 26);
  drawTextOutlined(ctx, "EYES: BRO  WT: 180", 470, 260, 26);
  drawTextOutlined(ctx, "REAL ID", 700, 490, 22, "black");
  drawTextOutlined(ctx, "ISSUED: 04/20/2018", 470, 380, 26);
  drawTextOutlined(ctx, "DEPARTMENT OF PUBLIC", 60, 430, 18, "#333");
  drawTextOutlined(ctx, "SAFETY", 60, 452, 18, "#333");
  const img = cv.toBuffer("image/png");
  fs.writeFileSync(out, img);
  console.log("wrote", out, img.length, "bytes");
}

function makePassport(out) {
  const w = 900, h = 640;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f4f7fc";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1a2e5a";
  ctx.fillRect(0, 0, w, 120);
  drawTextOutlined(ctx, "UNITED STATES OF AMERICA", 40, 70, 40, "white");
  drawTextOutlined(ctx, "PASSPORT", 600, 70, 40, "white");
  ctx.strokeStyle = "#1a2e5a";
  ctx.strokeRect(14, 130, w - 28, h - 150);
  drawTextOutlined(ctx, "Type P  Code USA  Passport No 123456789", 60, 200, 24);
  drawTextOutlined(ctx, "Surname DOE", 60, 250, 24);
  drawTextOutlined(ctx, "Given Name JOHN ADAM", 60, 300, 24);
  drawTextOutlined(ctx, "DOB 02/15/1985", 60, 350, 24);
  drawTextOutlined(ctx, "Sex M  Place of Birth CALIFORNIA", 60, 400, 24);
  drawTextOutlined(ctx, "U.S. DEPARTMENT OF STATE", 60, 450, 24);
  drawTextOutlined(ctx, "P<USAJOHNDOE<<JOHN<<ADAM<<<<<<<<<<<<", 60, 520, 24);
  drawTextOutlined(ctx, "123456789<USA8502154M1502150<<<<<<<<<2", 60, 570, 24);
  const img = cv.toBuffer("image/png");
  fs.writeFileSync(out, img);
  console.log("wrote", out, img.length, "bytes");
}

makeDriverLicense(process.argv[2]);
makePassport(process.argv[3]);