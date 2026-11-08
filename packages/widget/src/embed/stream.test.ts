import { describe, expect, it } from 'vitest';
import type { ChatEvent } from '../protocol';
import { parseSSE } from './stream';

const encoder = new TextEncoder();

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: Uint8Array[]) {
  const events: ChatEvent[] = [];
  for await (const event of parseSSE(streamOf(chunks))) events.push(event);
  return events;
}

describe('parseSSE', () => {
  it('parses several events from one chunk', async () => {
    const wire = 'data: {"type":"delta","text":"a"}\n\ndata: {"type":"done"}\n\n';
    expect(await collect([encoder.encode(wire)])).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'done' },
    ]);
  });

  it('reassembles an event split across chunks', async () => {
    const wire = encoder.encode('data: {"type":"delta","text":"ab"}\n\n');
    expect(await collect([wire.slice(0, 7), wire.slice(7)])).toEqual([{ type: 'delta', text: 'ab' }]);
  });

  it('keeps a Korean character split between bytes', async () => {
    const wire = encoder.encode('data: {"type":"delta","text":"환불"}\n\n');
    const middleOfFirstCharacter = wire.indexOf(0xed) + 1;
    expect(await collect([wire.slice(0, middleOfFirstCharacter), wire.slice(middleOfFirstCharacter)])).toEqual([
      { type: 'delta', text: '환불' },
    ]);
  });
});
