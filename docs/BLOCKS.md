# Building blocks

`shared/catalog/blocks.ts` lists every Microsoft component the board can contain. Each entry has:

| Field | Meaning |
|---|---|
| `name` | The official name, as Microsoft writes it |
| `product` | The Microsoft product or service it belongs to |
| `family` | How it is drawn: `agent`, `capability`, `governance` or `io` |
| `status` | `ga`, `preview` (shown on the board) or `design_only` (described, wired up by the host) |
| `compiles` | What the compiler emits for it ([BOARD_MODEL.md](BOARD_MODEL.md)) |
| `source`, `checked` | The Microsoft page the name and meaning were checked against, and when |
| `icon` | The official Azure architecture icon, once added |

The board model's enums (component kinds, tool types, knowledge sources, memory stores) map onto these entries one to one. `tests/blocks.test.ts` fails if any value has no block, so the coach can only place components that are in this list.

## Rules for adding a block

1. Add it together with its compile meaning. A block the compiler cannot produce is marked `design_only`, never left implied.
2. Check the official name and the meaning against Microsoft's documentation, and record the page and the date.
3. Mark preview features as `preview`; the board shows it.
4. Start from what the compiler supports. The list grows with the compiler, not ahead of it.

## Visual families

| Family | Blocks | Drawn as |
|---|---|---|
| Agent | Foundry Agent Service agents | A card with a dark header band. Capabilities used by this agent only are docked on the card as chips |
| Capability | tools, knowledge, long-term memory | A rounded capsule tinted by kind (tool grey, knowledge indigo, memory violet), with the building block named on top. Shown as its own element when it is shared by several agents or gated by an approval |
| Governance | guardrails, approvals | A band across the system for a guardrail; a diamond on the path for an approval |
| Where work enters and leaves | triggers, outputs | A plain grey block |

Conversation history is a property shown with the agent; long-term memory is a capability, because it is a separate store.

## Icons

The official Azure architecture icons will be shown next to each block's name. Microsoft's terms ([Azure icons](https://learn.microsoft.com/azure/architecture/icons/)) permit their use in architectural diagrams, training materials and documentation, and ask not to crop, flip, rotate, distort or reshape them, and not to use them to represent your own product. Microsoft recommends placing the product name close to the icon, which the board does for every block. Only the icons in use will be added, unmodified, with Microsoft's terms file.
