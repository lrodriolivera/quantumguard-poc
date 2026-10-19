"""Minimal DER encoding/decoding for the few ASN.1 structures we build or inspect."""

from typing import List, Tuple


class DERError(ValueError):
    pass


def tlv(tag: int, content: bytes) -> bytes:
    n = len(content)
    if n < 0x80:
        length = bytes([n])
    else:
        raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
        length = bytes([0x80 | len(raw)]) + raw
    return bytes([tag]) + length + content


def sequence(*items: bytes) -> bytes:
    return tlv(0x30, b"".join(items))


def integer(value: int) -> bytes:
    if value < 0:
        raise DERError("negative integers are not supported")
    return tlv(0x02, value.to_bytes(value.bit_length() // 8 + 1, "big"))


def octet_string(value: bytes) -> bytes:
    return tlv(0x04, value)


def generalized_time(value: str) -> bytes:
    return tlv(0x18, value.encode("ascii"))


def oid(dotted: str) -> bytes:
    parts = [int(p) for p in dotted.split(".")]
    body = bytearray([40 * parts[0] + parts[1]])
    for value in parts[2:]:
        chunk = [value & 0x7F]
        value >>= 7
        while value:
            chunk.insert(0, 0x80 | (value & 0x7F))
            value >>= 7
        body.extend(chunk)
    return tlv(0x06, bytes(body))


def decode_oid(content: bytes) -> str:
    first = content[0]
    parts = [first // 40, first % 40]
    value = 0
    for byte in content[1:]:
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            parts.append(value)
            value = 0
    return ".".join(str(p) for p in parts)


def header(buf: bytes, pos: int) -> Tuple[int, int, int]:
    """Return (tag, content_start, content_length) of the element at pos."""
    try:
        tag = buf[pos]
        length = buf[pos + 1]
        pos += 2
        if length & 0x80:
            n = length & 0x7F
            if n == 0 or n > 4:
                raise DERError("unsupported DER length")
            length = int.from_bytes(buf[pos:pos + n], "big")
            pos += n
    except IndexError as e:
        raise DERError("truncated DER") from e
    if pos + length > len(buf):
        raise DERError("truncated DER")
    return tag, pos, length


def children(buf: bytes, start: int, length: int) -> List[Tuple[int, bytes]]:
    """Split a constructed element's content into (tag, content) pairs."""
    items = []
    pos, end = start, start + length
    while pos < end:
        tag, cstart, clen = header(buf, pos)
        items.append((tag, buf[cstart:cstart + clen]))
        pos = cstart + clen
    return items
