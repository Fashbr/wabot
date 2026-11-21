import React from 'react';

interface WhatsAppTextProps {
  text: string;
}

function renderInlineFormatting(line: string, lineIndex: number): React.ReactNode[] {
  const tokens = line.split(/(\*[^*]+\*|_[^_]+_)/g);
  return tokens.map((token, idx) => {
    const key = `${lineIndex}-${idx}`;
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <strong key={key} className="font-semibold">
          {token.slice(1, -1)}
        </strong>
      );
    }
    if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
      return (
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={key}>{token}</React.Fragment>;
  });
}

export function WhatsAppText({ text }: WhatsAppTextProps) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-[14px] leading-relaxed break-words">
      {lines.map((line, i) => (
        <p key={i} className={line === '' ? 'h-2' : ''}>
          {line === '' ? null : renderInlineFormatting(line, i)}
        </p>
      ))}
    </div>
  );
}
