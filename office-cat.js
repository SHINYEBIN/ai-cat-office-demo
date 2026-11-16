// Project a small articulated 3D model into each office character's canvas.
const catPalettes = {
  manager: { fur: '#edbb9e', muzzle: '#f5c8ac', jacket: '#605183', eyes: '#53343b' },
  coco: { fur: '#efd4a9', muzzle: '#fff0d8', jacket: '#8c705b', eyes: '#716034' },
  lulu: { fur: '#a39b96', muzzle: '#e9dcd0', jacket: '#526986', eyes: '#76532f', stripe: '#665b59' },
  mango: { fur: '#eda449', muzzle: '#fff1d7', jacket: '#a65e37', eyes: '#6a4224', stripe: '#c76c29' },
  bori: { fur: '#34313d', muzzle: '#fff4e8', jacket: '#555772', eyes: '#9a672d' }
};

const sphereMesh = [];
const employeeBadgeNames = { coco: '코코', lulu: '루루', mango: '망고', bori: '보리' };
for (let ring = 0; ring < 8; ring++) {
  for (let sector = 0; sector < 12; sector++) {
    const point = (row, column) => {
      const latitude = Math.PI * row / 8;
      const longitude = 2 * Math.PI * column / 12;
      return [Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)];
    };
    sphereMesh.push([point(ring, sector), point(ring + 1, sector),
      point(ring + 1, sector + 1), point(ring, sector + 1)]);
  }
}

function drawOfficeCat(context, id, motion, direction, time, gesture = 0) {
  const { fur, muzzle, jacket, eyes, stripe } = catPalettes[id];
  const human = id === 'manager';
  const sleeping = motion === 'relaxing';
  const holdingCoffee = motion === 'coffee';
  const reading = motion === 'reading';
  const sitting = ['working', 'reporting', 'raising-paw', 'resting', 'relaxing'].includes(motion);
  const walking = motion === 'walking';
  const watching = human && motion === 'watching';
  const angry = human && motion === 'angry';
  const slacking = !human && motion === 'slacking';
  const swing = walking ? Math.sin(time * 0.014) : 0;
  const bounce = Math.abs(swing) * .055;
  const yaw = motion === 'portrait' ? 0 : watching ? Math.sin(time * .005) * .5
    : walking || motion === 'bowing' ? (direction === 'left' ? -.72 : .72) : .22;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const faces = [];
  const hip = sitting ? .49 : .78;
  const bend = motion === 'bowing' ? gesture * Math.PI / 2 : 0;
  const toCamera = ([x, y, z]) => {
    if (bend && y > hip) {
      const height = y - hip;
      const angle = bend * Math.min(1, height / .28);
      y = hip + height * Math.cos(angle) - z * Math.sin(angle);
      z = height * Math.sin(angle) + z * Math.cos(angle);
    }
    return [x * cos + z * sin, y + bounce, z * cos - x * sin];
  };

  function addFace(points, color, light) {
    const vertices = points.map(toCamera);
    const depth = vertices.reduce((sum, point) => sum + point[2], 0) / vertices.length;
    const rgb = Number.parseInt(color.slice(1), 16);
    const shade = channel => Math.min(255, Math.round(channel * light));
    faces.push({ vertices, depth, color: `rgb(${shade(rgb >> 16)},${shade(rgb >> 8 & 255)},${shade(rgb & 255)})` });
  }

  function oval(x, y, z, rx, ry, rz, color) {
    for (const face of sphereMesh) {
      const [nx, ny, nz] = face.reduce(([a, b, c], [u, v, w]) => [a + u / 4, b + v / 4, c + w / 4], [0, 0, 0]);
      if (nz * cos - nx * sin < -.08) continue;
      addFace(face.map(([u, v, w]) => [x + u * rx, y + v * ry, z + w * rz]), color,
        .79 + .29 * Math.max(0, -.4 * nx + .72 * ny + .55 * nz));
    }
  }

  const head = hip + .83;
  if (human) {
    oval(0, head - .20, -.22, .34, .63, .21, '#3c252b');
    oval(-.28, head - .37, -.12, .12, .43, .13, '#503136');
    oval(.28, head - .33, -.15, .12, .44, .13, '#42272e');
  }
  if (!human) {
    oval(-.35, hip - .06, -.33, .34, .10, .13, fur);
    oval(-.65, hip + .07, -.34, .13, .22, .11, fur);
  }
  oval(0, hip + .11, 0, .38, .47, .27, jacket);
  oval(0, hip + .30, .23, .13, .25, .07, '#f4e7d9');
  oval(0, hip + .32, .29, .044, .16, .034, '#53466b');
  if (!human && motion !== 'portrait') {
    const cord = id === 'coco' ? '#bd913d' : '#7562a3';
    const badgeTop = hip + .21;
    const badgeBottom = hip - .04;
    for (const side of [-1, 1]) {
      addFace([[side * .15, hip + .48, .28], [side * .107, hip + .48, .30],
        [side * .018, badgeTop, .37], [side * .062, badgeTop, .37]], cord, 1);
    }
    addFace([[-.22, badgeBottom, .365], [.22, badgeBottom, .365],
      [.22, badgeTop, .365], [-.22, badgeTop, .365]], id === 'coco' ? '#dfb457' : '#ddd0ef', 1);
    addFace([[-.187, badgeBottom + .03, .378], [.187, badgeBottom + .03, .378],
      [.187, badgeTop - .035, .378], [-.187, badgeTop - .035, .378]], '#fffaf2', 1);
    faces.at(-1).badge = employeeBadgeNames[id];
  }
  for (const side of [-1, 1]) {
    const stride = side * swing;
    oval(side * .19, sitting ? .30 : .37 + Math.max(0, stride) * .13,
      sitting ? .22 : stride * .28, .135, sitting ? .16 : .32, .14, jacket);
    oval(side * .19, sitting ? .19 : .12 + Math.max(0, stride) * .13,
      sitting ? .39 : .08 + stride * .28, .14, .115, .19, muzzle);
    oval(side * .36, hip + .20, sitting ? .19 : -stride * .16, .14, .24, .14, jacket);
    if (motion === 'raising-paw' && side === 1) {
      oval(.48, hip + .48, .18, .115, .29, .13, jacket);
      oval(.51, hip + .75, .19, .125, .13, .14, fur);
    } else if (holdingCoffee && side === 1) {
      const sip = gesture;
      const cupX = .51 - .46 * sip;
      const cupY = hip + .22 + .30 * sip;
      const cupZ = .51 - .13 * sip;
      oval(.39 - .23 * sip, hip + .08 + .18 * sip, .25, .13, .12 + .08 * sip, .24, jacket);
      oval(cupX - .08, cupY - .14, cupZ - .05, .11, .10, .14, fur);
      oval(cupX, cupY, cupZ, .145, .15, .13, '#c4e9e5');
      oval(cupX, cupY + .13, cupZ, .15, .035, .135, '#effbf7');
      oval(cupX, cupY + .142, cupZ, .119, .021, .106, '#72442e');
    } else if (slacking) {
      oval(side * .14, hip + .18, .43, .10, .10, .13, fur);
    } else if (reading) {
      oval(side * (.14 + .17 * gesture), hip + .17 + .16 * gesture, .46, .105, .10, .12, fur);
    } else {
      oval(side * (sitting ? .22 : .37), sitting ? hip + .05 + (motion === 'working' ? side * Math.sin(time * .021) * .04 : 0) : hip - .03,
        sitting ? .48 : -stride * .29, .11, .11, .14, fur);
    }
    if (human) {
      oval(side * .30, head - .02, 0, .08, .115, .10, fur);
      oval(side * .32, head - .11, .047, .026, .035, .025, '#e7bc70');
      continue;
    }
    const outer = [side * .48, head + .20, .02];
    const tip = [side * .37, head + .61, -.02];
    const inner = [side * .15, head + .30, .06];
    addFace([outer, tip, inner], fur, 1.02);
    addFace([outer, [side * .29, head + .29, -.21], tip], fur, .76);
    addFace([[side * .39, head + .29, .04], [side * .35, head + .51, .005],
      [side * .22, head + .33, .065]], '#e2a2a4', .98);
  }
  if (slacking) {
    const phone = (left, right, bottom, top, z, color) => addFace(
      [[left, bottom, z], [right, bottom, z], [right, top, z], [left, top, z]], color, 1);
    phone(-.09, .09, hip + .08, hip + .34, .53, '#27263d');
    phone(-.07, .07, hip + .11, hip + .31, .54, '#94bfcf');
  }
  if (reading) {
    const width = .13 + .25 * gesture;
    const bottom = hip + .16 + .16 * gesture;
    const top = bottom + .35;
    const edge = .52 + .08 * gesture;
    function folderPanel(side, left, right, low, high, depth, color) {
      const corner = (across, y) => [side * width * across, y, .56 + (edge - .56) * across + depth];
      addFace([corner(left, low), corner(right, low), corner(right, high), corner(left, high)], color, 1);
    }
    folderPanel(-1, 0, 1, bottom, top, 0, '#d49849');
    folderPanel(1, 0, 1, bottom, top, 0, '#ebb462');
    folderPanel(1, .53, .93, top - .015, top + .065, 0, '#ebb462');
    folderPanel(1, .61, .88, top + .018, top + .046, .012, '#fff2ce');
    folderPanel(1, .13, .87, bottom + .045, top - .035, .018, '#d4c9ad');
    folderPanel(1, .10, .81, bottom + .062, top - .019, .033, '#fffaf0');
    folderPanel(1, .18, .63, top - .101, top - .068, .046, '#57758b');
    for (const line of [.13, .19]) {
      folderPanel(1, .18, .70, top - line - .018, top - line, .046, '#aaa498');
    }
    folderPanel(1, .04, .98, bottom + .013, bottom + .088, .067, '#dba354');
    folderPanel(-1, .08, .92, bottom + .016, bottom + .13, .023, '#bd8039');
    folderPanel(-1, .18, .63, bottom + .17, bottom + .24, .017, '#fff2ce');
    folderPanel(1, 0, .055, bottom, top, .041, '#a87035');
  }
  oval(0, head, 0, human ? .31 : .54, human ? .43 : .45, human ? .31 : .42, fur);
  if (human) {
    oval(0, head + .25, -.045, .34, .24, .32, '#42272e');
    oval(-.115, head + .24, .21, .21, .105, .115, '#56343a');
    oval(.18, head + .20, .17, .134, .135, .13, '#482b32');
  }
  for (const side of [-1, 1]) {
    if (human) {
      if (angry) {
        addFace([[side * .05, head + .054, .32], [side * .05, head + .079, .32],
          [side * .17, head + .14, .32], [side * .17, head + .109, .32]], '#61313a', 1);
      } else oval(side * .115, head + (watching ? .064 : .095), .287, .063, .014, .019, '#71464a');
      oval(side * .115, head + .02, .29, .052, watching ? .017 : .039, .026, '#342731');
      oval(side * .115 - .013, head + .035, .315, .012, .012, .008, '#fff6ee');
      oval(side * .20, head - .083, .263, .048, .026, .020, '#df957f');
      continue;
    }
    oval(side * .13, head - .16, .35, .205, .145, .11, muzzle);
    oval(side * .35, head - .105, .322, .071, .036, .035, '#edaaa3');
    if (sleeping) {
      oval(side * .205, head + .018, .371, .105, .018, .042, '#493847');
    } else {
      if (id === 'lulu') oval(side * .205, head + .035, .340, .153, .15, .053, '#3d323b');
      oval(side * .205, head + .038, .371, .117, .118, .057, '#fff2df');
      oval(side * .20, head + .037, .437, .087, .098, .046, eyes);
      oval(side * .196, head + .035, .47, .059, .075, .023, '#211d27');
      oval(side * .20 - .025, head + .073, .49, .026, .026, .012, '#ffffff');
      oval(side * .20 + .024, head + .006, .488, .013, .014, .01, '#fff0dc');
    }
    if (stripe) oval(side * .30, head + .23, .236, .055, .104, .047, stripe);
  }
  if (stripe) oval(0, head + .28, .29, .059, .10, .043, stripe);
  if (id === 'lulu') oval(0, head + .06, .389, .098, .022, .027, '#3d323b');
  if (human) {
    oval(0, head - .064, .301, .049, .058, .043, muzzle);
    oval(0, head - .17, .287, .082, angry ? .055 : .018, .019, angry ? '#793947' : '#935650');
  } else {
    oval(0, head - .114, .459, .058, .034, .027, '#b87279');
    oval(0, head - .225, .45, .061, .024, .016, '#875258');
  }

  context.clearRect(0, 0, 128, 148);
  context.fillStyle = '#46304426';
  context.beginPath();
  context.ellipse(64, 131, 27, 6, 0, 0, 2 * Math.PI);
  context.fill();
  faces.sort((a, b) => a.depth - b.depth);
  for (const { vertices, color, badge } of faces) {
    context.beginPath();
    for (const [x, y, z] of vertices) {
      context.lineTo(64 + x * 56, 130 - y * 50 + z * 8);
    }
    context.closePath();
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = .7;
    context.fill();
    context.stroke();
    if (badge) {
      const [x, y, z] = toCamera([0, hip + .085, .378]);
      context.fillStyle = '#352849';
      context.font = 'bold 8px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(badge, 64 + x * 56, 130 - y * 50 + z * 8, 18 * cos);
    }
  }
}
