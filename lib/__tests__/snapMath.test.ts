import { snapMove, snapResize } from '../../components/desktop/signing/snapMath';

const page = { v: [400], h: [], width: 800, height: 1100 };

describe('snapMove', () => {
  it('lines a field up with the middle of the page and shows the line', () => {
    const result = snapMove({ x: 345, y: 200, w: 100, h: 30 }, [], page, 6);
    expect(result.x).toBe(350);
    expect(result.guides).toEqual([{ axis: 'v', at: 400, from: 0, to: 1100 }]);
  });

  it('lines a field up with another field, edge to edge and middle to middle', () => {
    const other = { x: 100, y: 500, w: 120, h: 30 };
    const result = snapMove({ x: 103, y: 496, w: 80, h: 30 }, [other], page, 6);
    expect(result.x).toBe(100);
    expect(result.y).toBe(500);
    expect(result.guides.map((g) => g.axis).sort()).toEqual(['h', 'v']);
  });

  it('leaves a field alone when nothing is close', () => {
    expect(snapMove({ x: 100, y: 100, w: 50, h: 20 }, [], page, 6)).toEqual({ x: 100, y: 100, guides: [] });
  });
});

describe('snapResize', () => {
  it('stretches the right edge to meet a line', () => {
    const result = snapResize({ x: 300, y: 100, w: 97, h: 30 }, [], page, 6);
    expect(result.w).toBe(100);
  });
});
