"""Encode/decode Borsh thủ công cho instruction & account data của chương
trình Anchor `history_game` — không phụ thuộc anchorpy/IDL (không cần chạy
`anchor build` để có IDL, chỉ cần khớp đúng thứ tự field trong lib.rs)."""
import hashlib
import struct


def anchor_discriminator(namespace: str, name: str) -> bytes:
    """8 byte đầu của instruction/account data theo chuẩn Anchor.
    namespace: "global" cho instruction, "account" cho account struct."""
    return hashlib.sha256(f"{namespace}:{name}".encode("utf-8")).digest()[:8]


class BorshWriter:
    def __init__(self) -> None:
        self.buf = bytearray()

    def u8(self, v: int) -> "BorshWriter":
        self.buf += struct.pack("<B", v)
        return self

    def u64(self, v: int) -> "BorshWriter":
        self.buf += struct.pack("<Q", v)
        return self

    def i64(self, v: int) -> "BorshWriter":
        self.buf += struct.pack("<q", v)
        return self

    def string(self, s: str) -> "BorshWriter":
        raw = s.encode("utf-8")
        self.buf += struct.pack("<I", len(raw)) + raw
        return self

    def pubkey(self, raw32: bytes) -> "BorshWriter":
        assert len(raw32) == 32
        self.buf += raw32
        return self

    def bytes(self) -> bytes:
        return bytes(self.buf)


class BorshReader:
    def __init__(self, data: bytes, offset: int = 0) -> None:
        self.data = data
        self.offset = offset

    def _take(self, length: int) -> bytes:
        if length < 0 or self.offset + length > len(self.data):
            raise ValueError("Truncated Borsh account")
        value = self.data[self.offset:self.offset + length]
        self.offset += length
        return value

    def read_pubkey(self) -> bytes:
        return self._take(32)

    def read_u8(self) -> int:
        v = self.data[self.offset]
        self.offset += 1
        return v

    def read_u64(self) -> int:
        return struct.unpack("<Q", self._take(8))[0]

    def read_i64(self) -> int:
        return struct.unpack("<q", self._take(8))[0]

    def read_string(self) -> str:
        length = struct.unpack("<I", self._take(4))[0]
        return self._take(length).decode("utf-8")
