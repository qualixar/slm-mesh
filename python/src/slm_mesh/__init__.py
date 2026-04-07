"""SLM Mesh -- Python client for peer-to-peer AI agent communication.

Copyright 2026 Varun Pratap Bhardwaj. MIT License.
Part of the Qualixar research initiative by Varun Pratap Bhardwaj.
https://github.com/qualixar/slm-mesh
"""

from .client import SLMMeshClient, SLMMeshError
from .types import BrokerStatus, Lock, MeshEvent, Message, Peer, StateEntry, PeerStats, MessageStats

__version__ = "1.0.0"
__all__ = [
    "SLMMeshClient",
    "SLMMeshError",
    "Peer",
    "Message",
    "StateEntry",
    "Lock",
    "MeshEvent",
    "BrokerStatus",
    "PeerStats",
    "MessageStats",
]
