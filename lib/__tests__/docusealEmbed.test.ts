import { docusealFormSrc, docusealHost, scriptJson, withSafeSrc } from '../docusealEmbed';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock') // eslint-disable-line @typescript-eslint/no-require-imports
);

describe('a DocuSeal page opened from a link', () => {
  it("loads scripts only from DocuSeal's own hosts", () => {
    expect(docusealHost('cdn.docuseal.eu')).toBe('cdn.docuseal.eu');
    expect(docusealHost('evil.example')).toBe('cdn.docuseal.com');
    expect(docusealHost('docuseal.com.evil.example')).toBe('cdn.docuseal.com');
    expect(docusealHost(undefined)).toBe('cdn.docuseal.com');
  });

  it('opens a signing form only from DocuSeal', () => {
    expect(docusealFormSrc('https://docuseal.com/s/abc')).toBe('https://docuseal.com/s/abc');
    expect(docusealFormSrc('https://evil.example/s/abc')).toBe('');
    expect(docusealFormSrc('javascript:alert(1)')).toBe('');
  });

  it('cannot end the page script early', () => {
    expect(scriptJson('</script><script>alert(1)</script>')).not.toContain('</script>');
  });
});

describe('a document address from a link', () => {
  it('is kept for https, and dropped when it would run script', () => {
    expect(withSafeSrc({ src: 'https://x.supabase.co/a.pdf' }).src).toBe('https://x.supabase.co/a.pdf');
    expect(withSafeSrc({ src: 'javascript:alert(1)' }).src).toBeUndefined();
    expect(withSafeSrc({ src: 'not a url' }).src).toBeUndefined();
  });
});
