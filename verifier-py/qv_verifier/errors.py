"""Error type carrying a QV-16 §5.20 error code (the codes used in the v1 vectors)."""


class QVError(Exception):
    """A protocol-level rejection with a registry code such as ``E_POINT_DECODE``."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


class NotImplementedOp(Exception):
    """Raised by the dispatcher for operations this skeleton does not implement."""
