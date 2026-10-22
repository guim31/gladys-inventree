// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): read the stock of a part, and
// remove a quantity from it (disabled unless enabled in the configuration).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  read_part_stock(hub, { fields = {} }) {
    return hub.readPart(fields.part);
  },
  remove_stock(hub, { fields = {} }) {
    return hub.removeStock(fields.part, fields.quantity);
  },
};
