/**
 * Guess the Verb
 * by John Googol
 *
 * A Parser Puzzle Laboratory
 * Translated from Inform 7 to Sharpee
 */

import {
  Story,
  StoryConfig,
  WorldModel,
  IFEntity,
  Parser,
  EnglishLanguageProvider,
  GameEngine,
} from '@sharpee/sharpee';

import {
  IdentityTrait,
  RoomTrait,
  SceneryTrait,
  ContainerTrait,
  OpenableTrait,
  LockableTrait,
  SupporterTrait,
  ReadableTrait,
  ActorTrait,
  Direction,
  ITrait,
  registerActionInterceptor,
  ActionInterceptor,
  createEffect,
} from '@sharpee/world-model';

import {
  createEvent,
  type ActionContext,
  type ValidationResult,
  type Action,
} from '@sharpee/stdlib';

import type { ISemanticEvent } from '@sharpee/core';

// ---------------------------------------------------------------------------
// Story config
// ---------------------------------------------------------------------------

export const config: StoryConfig = {
  id: 'guess-the-verb',
  title: 'Guess the Verb',
  author: 'John Googol',
  version: '1.0.0',
  description:
    "Explore your grandmother's old house and find the family heirloom she left behind. Every room tests a different verb pattern.",
};

// ---------------------------------------------------------------------------
// Custom Trait: PuzzlePropTrait
// Marks entities that have story-specific action overrides.
// The propId identifies which entity for interceptor dispatch.
// ---------------------------------------------------------------------------

class PuzzlePropTrait implements ITrait {
  static readonly type = 'story.puzzleProp' as const;
  readonly type = 'story.puzzleProp' as const;
  propId: string;
  constructor(propId: string) {
    this.propId = propId;
  }
}

// ---------------------------------------------------------------------------
// Entity ID constants (populated during initializeWorld)
// ---------------------------------------------------------------------------

const entityIds: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Helper: create a scenery entity with aliases and adjectives
// ---------------------------------------------------------------------------

function scenery(
  world: WorldModel,
  name: string,
  room: IFEntity,
  description: string,
  opts: {
    aliases?: string[];
    adjectives?: string[];
    article?: string;
    concealed?: boolean;
    grammaticalNumber?: 'singular' | 'plural';
    propId?: string;
  } = {},
): IFEntity {
  const entity = world.createEntity(name, 'scenery');
  entity.add(
    new IdentityTrait({
      name,
      description,
      aliases: opts.aliases ?? [],
      adjectives: opts.adjectives ?? [],
      article: opts.article ?? 'a',
      concealed: opts.concealed ?? false,
      grammaticalNumber: opts.grammaticalNumber,
    }),
  );
  entity.add(new SceneryTrait({ mentioned: false, visible: true }));
  if (opts.propId) {
    entity.add(new PuzzlePropTrait(opts.propId));
    entityIds[opts.propId] = entity.id;
  }
  world.moveEntity(entity.id, room.id);
  return entity;
}

// ---------------------------------------------------------------------------
// Helper: emit a simple text message as event
// ---------------------------------------------------------------------------

function msg(text: string, ctx?: ActionContext): ISemanticEvent {
  // When called from an action (ctx available), use context.event() which
  // produces renderable text blocks. When called from interceptors/plugins
  // (no ctx), fall back to createEvent (interceptors convert to effects).
  if (ctx && typeof (ctx as any).event === 'function') {
    return (ctx as any).event('game.message', {
      messageId: 'story.custom',
      params: { fallback: text },
    });
  }
  return createEvent('game.message', { messageId: 'story.custom', params: { fallback: text } });
}

// ---------------------------------------------------------------------------
// Custom Actions
// ---------------------------------------------------------------------------

const diggingAction: Action = {
  id: 'story.action.digging',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const world = context.world;
    const player = context.player;

    // Need trowel
    const trowelId = entityIds['trowel'];
    if (trowelId && world.getLocation(trowelId) !== player.id) {
      return [msg("You'd need a digging tool. Your bare hands won't work.", context)];
    }

    // Digging the flower bed
    const flowerBedId = entityIds['flower-bed'];
    if (target.id === flowerBedId) {
      const mechId = entityIds['mechanism'];
      const mech = mechId ? world.getEntity(mechId) : undefined;
      if (mech && !world.getLocation(mechId!)) {
        // Mechanism is nowhere — reveal it
        const gardenId = entityIds['garden'];
        if (gardenId) world.moveEntity(mechId!, gardenId);
        world.awardScore('mechanism-found', 1, 'Unearthing the mechanism');
        return [msg("You dig into the soft earth and uncover a small brass mechanism wrapped in oilcloth. It's the innards of a music box.", context)];
      } else {
        return [msg("You've already dug up everything here.", context)];
      }
    }

    return [msg(`You dig at ${target.get(IdentityTrait)?.name ?? 'it'} but find nothing.`, context)];
  },
};

const diggingHereAction: Action = {
  id: 'story.action.digging-here',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    return { valid: true };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const gardenId = entityIds['garden'];
    const loc = context.world.getLocation(context.player.id);
    if (loc === gardenId) {
      const flowerBed = entityIds['flower-bed'];
      if (flowerBed) {
        const fb = context.world.getEntity(flowerBed);
        if (fb) {
          // Delegate to the digging action's logic
          const trowelId = entityIds['trowel'];
          if (trowelId && context.world.getLocation(trowelId) !== context.player.id) {
            return [msg("The soil is too packed for bare hands. You need a tool.", context)];
          }
          const mechId = entityIds['mechanism'];
          if (mechId && !context.world.getLocation(mechId)) {
            context.world.moveEntity(mechId, gardenId);
            context.world.awardScore('mechanism-found', 1, 'Unearthing the mechanism');
            return [msg("(digging the flower bed)\n\nYou dig into the soft earth and uncover a small brass mechanism wrapped in oilcloth. It's the innards of a music box.", context)];
          }
          return [msg("(digging the flower bed)\n\nYou've already dug up everything here.", context)];
        }
      }
    }
    return [msg("There's nothing to dig here.", context)];
  },
};

const windingAction: Action = {
  id: 'story.action.winding',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const world = context.world;
    const player = context.player;
    const musicBoxId = entityIds['music-box'];

    if (target.id !== musicBoxId) {
      return [msg(`You can't wind ${target.get(IdentityTrait)?.name ?? 'that'}.`, context)];
    }

    // Need winding key
    const windKeyId = entityIds['winding-key'];
    if (!windKeyId || world.getLocation(windKeyId) !== player.id) {
      return [msg("You'd need something to wind it with -- a small key, perhaps.", context)];
    }

    // Need mechanism inside the music box
    const mechId = entityIds['mechanism'];
    if (!mechId || world.getLocation(mechId) !== musicBoxId) {
      return [msg('The music box cavity is empty. It needs its mechanism.', context)];
    }

    // Need spring inside the music box
    const springId = entityIds['spring'];
    if (!springId || world.getLocation(springId) !== musicBoxId) {
      return [msg("The music box is missing its spring. It won't hold tension.", context)];
    }

    // Success! Unlock the trunk
    const trunkId = entityIds['trunk'];
    if (trunkId) {
      const trunk = world.getEntity(trunkId);
      if (trunk) {
        const lockable = trunk.get(LockableTrait);
        if (lockable) lockable.isLocked = false;
        const openable = trunk.get(OpenableTrait);
        if (openable) openable.isOpen = true;
      }
    }

    world.awardScore('music-box-wound', 2, 'Winding the music box');
    return [msg("You insert the butterfly key into the keyhole and wind the music box. The gears catch and a delicate melody fills the attic.\n\nAs the tune plays, you hear a click from the steamer trunk -- its mechanical lock releases and the lid swings open.", context)];
  },
};

const ringingAction: Action = {
  id: 'story.action.ringing',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const doorbellId = entityIds['doorbell'];
    if (target.id === doorbellId) {
      return [msg('(pressing the brass doorbell)\n\nYou press the doorbell. A faint chime echoes inside the house, unanswered.', context)];
    }
    return [msg(`You can't ring ${target.get(IdentityTrait)?.name ?? 'that'}.`, context)];
  },
};

const knockingAction: Action = {
  id: 'story.action.knocking',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const frontDoorId = entityIds['front-door'];
    if (target.id === frontDoorId) {
      return [msg("You rap your knuckles on the door. No answer. You'll need to let yourself in.", context)];
    }
    return [msg(`You knock on ${target.get(IdentityTrait)?.name ?? 'it'}. Nothing happens.`, context)];
  },
};

const lookingBehindAction: Action = {
  id: 'story.action.looking-behind',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const paintingId = entityIds['painting'];
    if (target.id === paintingId) {
      return doPushPainting(context.world, context);
    }
    return [msg(`You find nothing behind ${target.get(IdentityTrait)?.name ?? 'it'}.`, context)];
  },
};

const repairingAction: Action = {
  id: 'story.action.repairing',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const musicBoxId = entityIds['music-box'];
    if (target.id === musicBoxId) {
      const world = context.world;
      const mechId = entityIds['mechanism'];
      const springId = entityIds['spring'];
      const hasMech = mechId && world.getLocation(mechId) === musicBoxId;
      const hasSpring = springId && world.getLocation(springId) === musicBoxId;

      if (!hasMech && !hasSpring) {
        return [msg('The music box needs its mechanism and spring. Try putting them inside.', context)];
      } else if (!hasMech) {
        return [msg('The music box still needs its mechanism.', context)];
      } else if (!hasSpring) {
        return [msg('The music box still needs its spring.', context)];
      } else {
        return [msg('The parts are in place. Try winding it.', context)];
      }
    }
    return [msg(`${target.get(IdentityTrait)?.name ?? 'That'} doesn't seem to need fixing.`, context)];
  },
};

const helpAction: Action = {
  id: 'story.action.help',
  group: 'meta',

  validate(): ValidationResult {
    return { valid: true };
  },

  execute(): ISemanticEvent[] {
    return [msg(
      "You're exploring your grandmother's old house looking for an heirloom she left.\n\n" +
      'Search everywhere -- under things, behind things, inside things.\n' +
      'Pick up useful objects and try combining them.\n' +
      "If something seems broken, look for its missing parts.\n\n" +
      'Type VERBS for a full list of commands. Most puzzles use VERB NOUN.',
    )];
  },
};

const verbsAction: Action = {
  id: 'story.action.verbs',
  group: 'meta',

  validate(): ValidationResult {
    return { valid: true };
  },

  execute(): ISemanticEvent[] {
    return [msg(
      'Movement:  NORTH (N), SOUTH (S), EAST (E), WEST (W), UP (U), DOWN (D), IN, OUT\n' +
      'Looking:   LOOK (L), EXAMINE (X) thing, SEARCH thing, LOOK IN/UNDER thing\n' +
      'Taking:    TAKE thing, DROP thing, PUT thing IN/ON thing\n' +
      'Using:     OPEN, CLOSE, LOCK/UNLOCK thing WITH key, PUSH, PULL, TURN\n' +
      'Special:   DIG thing, WIND thing, LIGHT thing, RING thing, KNOCK ON thing\n' +
      'Assembly:  PUT thing IN thing, ATTACH thing TO thing, FIX thing\n' +
      'Self:      INVENTORY (I), WAIT (Z), WEAR thing, EAT thing\n' +
      'Meta:      SAVE, RESTORE, UNDO, SCORE, HELP, VERBS, RESTART, QUIT',
    )];
  },
};

const useAction: Action = {
  id: 'story.action.use',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const name = target.get(IdentityTrait)?.name ?? 'it';
    return [msg(`How do you want to use ${name}? Try a specific verb: OPEN, PUSH, PULL, TURN, EAT, WEAR, etc.`, context)];
  },
};

const useWithAction: Action = {
  id: 'story.action.use-with',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    const other = context.command.indirectObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target, other } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const other = context.validationResult!.data!.other as IFEntity | undefined;

    if (other?.get(LockableTrait)) {
      // Try unlocking
      return [msg(`(trying to unlock ${other.get(IdentityTrait)?.name ?? 'it'})`, context)];
    }
    const tName = target.get(IdentityTrait)?.name ?? 'that';
    const oName = other?.get(IdentityTrait)?.name ?? 'that';
    return [msg(`Try a specific command, such as PUT ${tName.toUpperCase()} ON ${oName.toUpperCase()} or GIVE ${tName.toUpperCase()} TO ${oName.toUpperCase()}.`, context)];
  },
};

// ---------------------------------------------------------------------------
// Shared puzzle logic (used by both actions and interceptors)
// ---------------------------------------------------------------------------

function doPushPainting(world: WorldModel, ctx?: ActionContext): ISemanticEvent[] {
  const moved = world.getStateValue('painting-moved') as boolean;
  if (!moved) {
    world.setStateValue('painting-moved', true);
    const safeId = entityIds['wall-safe'];
    if (safeId) {
      const safe = world.getEntity(safeId);
      if (safe) {
        const identity = safe.get(IdentityTrait);
        if (identity) identity.concealed = false;
      }
    }
    return [msg('You slide the painting aside, revealing a small wall safe set into the wall.', ctx)];
  }
  return [msg('The painting is already moved. The wall safe is exposed.', ctx)];
}

function doBurnFireplace(world: WorldModel, playerId: string, ctx?: ActionContext): ISemanticEvent[] {
  const lit = world.getStateValue('fireplace-lit') as boolean;
  if (lit) {
    return [msg('The fire is already crackling away.', ctx)];
  }
  const matchId = entityIds['matchbook'];
  if (!matchId || world.getLocation(matchId) !== playerId) {
    return [msg("You'd need something to light it with.", ctx)];
  }
  world.setStateValue('fireplace-lit', true);

  // Update fireplace description
  const fpId = entityIds['fireplace'];
  if (fpId) {
    const fp = world.getEntity(fpId);
    const identity = fp?.get(IdentityTrait);
    if (identity) {
      identity.description = 'A cheerful fire crackles in the grate, casting warm light across the room.';
    }
  }

  // Update hearthstone description
  const hsId = entityIds['hearthstone'];
  if (hsId) {
    const hs = world.getEntity(hsId);
    const hsIdentity = hs?.get(IdentityTrait);
    if (hsIdentity) {
      hsIdentity.description = 'In the firelight you can make out numbers scratched into the stone: 7-3-9.';
    }
  }

  world.awardScore('fireplace-lit', 1, 'Lighting the fireplace');
  return [msg("You strike a match and hold it to the logs. They catch quickly, filling the room with flickering warmth.\n\nIn the glow, you notice numbers scratched into the hearthstone: 7-3-9.", ctx)];
}

// ---------------------------------------------------------------------------
// Custom actions for verbs whose stdlib actions DON'T check interceptors.
// These replace the interceptor-based approach for: looking_under, searching,
// pulling, turning, climbing, wearing, unlocking.
// ---------------------------------------------------------------------------

function propId(entity: IFEntity): string | undefined {
  return entity.get(PuzzlePropTrait)?.propId;
}

function doLookUnderDoormat(world: WorldModel, ctx?: ActionContext): ISemanticEvent[] {
  const keyId = entityIds['iron-key'];
  if (keyId && !world.getLocation(keyId)) {
    const porchId = entityIds['porch'];
    if (porchId) world.moveEntity(keyId, porchId);
    world.awardScore('iron-key-found', 1, 'Finding the iron key');
    return [msg('You lift the corner of the doormat and find an iron key hidden underneath.', ctx)];
  }
  return [msg('Nothing else under the mat.', ctx)];
}

const lookingUnderAction: Action = {
  id: 'story.action.looking-under',
  group: 'perception',
  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },
  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    const id = propId(target);
    if (id === 'doormat') return doLookUnderDoormat(ctx.world, ctx);
    if (id === 'painting') return doPushPainting(ctx.world, ctx);
    const name = target.get(IdentityTrait)?.name ?? 'it';
    return [msg(`You find nothing under ${name}.`, ctx)];
  },
};

const storySearchingAction: Action = {
  id: 'story.action.searching',
  group: 'perception',
  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },
  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    const world = ctx.world;
    const id = propId(target);

    if (id === 'doormat') return doLookUnderDoormat(world, ctx);

    if (id === 'overcoat') {
      const matchId = entityIds['matchbook'];
      if (matchId && !world.getLocation(matchId)) {
        world.moveEntity(matchId, ctx.player.id);
        world.awardScore('matchbook-found', 1, 'Finding the matchbook');
        return [msg('You rummage through the coat pockets and find a matchbook.', ctx)];
      }
      return [msg('The pockets are empty now.', ctx)];
    }

    if (id === 'coat-rack') {
      const matchId = entityIds['matchbook'];
      if (matchId && !world.getLocation(matchId)) {
        world.moveEntity(matchId, ctx.player.id);
        world.awardScore('matchbook-found', 1, 'Finding the matchbook');
        return [msg('(searching the overcoat)\n\nYou rummage through the coat pockets and find a matchbook.', ctx)];
      }
      return [msg('(searching the overcoat)\n\nThe pockets are empty now.', ctx)];
    }

    // Default: if container, list contents
    if (target.get(ContainerTrait)) {
      const openable = target.get(OpenableTrait);
      if (openable && !openable.isOpen) {
        return [msg(`${target.get(IdentityTrait)?.name ?? 'It'} is closed.`, ctx)];
      }
      const contents = world.getContents(target.id);
      if (contents.length === 0) {
        return [msg(`${target.get(IdentityTrait)?.name ?? 'It'} is empty.`, ctx)];
      }
      const names = contents.map(e => e.get(IdentityTrait)?.name ?? 'something').join(', ');
      return [msg(`Inside you find: ${names}.`, ctx)];
    }
    return [msg('You find nothing of interest.', ctx)];
  },
};

const storyPullingAction: Action = {
  id: 'story.action.pulling',
  group: 'manipulation',
  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },
  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    const id = propId(target);
    if (id === 'doorbell') return [msg("It's a push button, not a pull cord. Try pressing it.", ctx)];
    if (id === 'painting') return doPushPainting(ctx.world, ctx);
    const name = target.get(IdentityTrait)?.name ?? 'that';
    return [msg(`Nothing happens when you pull ${name}.`, ctx)];
  },
};

const storyTurningAction: Action = {
  id: 'story.action.turning',
  group: 'manipulation',
  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },
  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    const id = propId(target);
    if (id === 'painting') return doPushPainting(ctx.world, ctx);
    if (id === 'sink') return [msg('You turn the faucet. Rusty water sputters out, then runs clear. You turn it off.', ctx)];
    const name = target.get(IdentityTrait)?.name ?? 'that';
    return [msg(`You can't turn ${name}.`, ctx)];
  },
};

const storyClimbingAction: Action = {
  id: 'story.action.climbing',
  group: 'movement',
  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },
  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    if (propId(target) === 'staircase') return [msg('(Try going UP to climb the stairs.)', ctx)];
    const name = target.get(IdentityTrait)?.name ?? 'that';
    return [msg(`You can't climb ${name}.`, ctx)];
  },
};

const storyUnlockingAction: Action = {
  id: 'story.action.unlocking',
  group: 'manipulation',
  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },
  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    if (propId(target) === 'trunk') {
      return [msg('The trunk has no keyhole. The lock seems mechanically connected to the shelf above.', ctx)];
    }
    // Default: let player know to use "unlock X with Y"
    const lockable = target.get(LockableTrait);
    if (!lockable) return [msg("That isn't something you can unlock.", ctx)];
    if (!lockable.isLocked) return [msg("It's already unlocked.", ctx)];
    return [msg('What do you want to unlock it with?', ctx)];
  },
};

// ---------------------------------------------------------------------------
// Action Interceptors — only for stdlib actions that CHECK interceptors:
// taking, pushing, switching_on, opening
// ---------------------------------------------------------------------------

const puzzleInterceptors: { actionId: string; interceptor: ActionInterceptor }[] = [

  // --- TAKING (stdlib checks interceptors ✓) ---
  {
    actionId: 'if.action.taking',
    interceptor: {
      preValidate(entity, world, actorId) {
        const id = entity.get(PuzzlePropTrait)?.propId;
        if (!id) return null;
        if (id === 'doormat') return { valid: false, error: 'story.doormat.take' };
        if (id === 'overcoat') return { valid: false, error: 'story.overcoat.take' };
        return null;
      },
      onBlocked(entity, world, actorId, error) {
        if (error === 'story.doormat.take') {
          // Redirect to looking under doormat
          const keyId = entityIds['iron-key'];
          if (keyId && !world.getLocation(keyId)) {
            const porchId = entityIds['porch'];
            if (porchId) world.moveEntity(keyId, porchId);
            world.awardScore('iron-key-found', 1, 'Finding the iron key');
            return [createEffect('game.message', { messageId: 'story.custom', params: { fallback: 'You lift the corner of the doormat and find an iron key hidden underneath.' } })];
          }
          return [createEffect('game.message', { messageId: 'story.custom', params: { fallback: 'Nothing else under the mat.' } })];
        }
        if (error === 'story.overcoat.take') {
          return [createEffect('game.message', { messageId: 'story.custom', params: { fallback: 'The coat is too moth-eaten to carry. But you could search the pockets.' } })];
        }
        return null;
      },
    },
  },

  // --- PUSHING (stdlib checks interceptors ✓) ---
  {
    actionId: 'if.action.pushing',
    interceptor: {
      preValidate(entity, world) {
        const id = entity.get(PuzzlePropTrait)?.propId;
        if (!id) return null;
        if (id === 'doorbell') return { valid: false, error: 'story.doorbell.push' };
        if (id === 'painting') return { valid: false, error: 'story.painting.push' };
        return null;
      },
      onBlocked(entity, world, actorId, error) {
        if (error === 'story.doorbell.push') {
          return [createEffect('game.message', { messageId: 'story.custom', params: { fallback: 'You press the doorbell. A faint chime echoes inside the house, unanswered.' } })];
        }
        if (error === 'story.painting.push') {
          const events = doPushPainting(world);
          return events.map(e => createEffect(e.type, e.data as Record<string, any>));
        }
        return null;
      },
    },
  },

  // --- SWITCHING ON (stdlib checks interceptors ✓) ---
  {
    actionId: 'if.action.switching_on',
    interceptor: {
      preValidate(entity) {
        if (entity.get(PuzzlePropTrait)?.propId === 'fireplace')
          return { valid: false, error: 'story.fireplace.switch_on' };
        return null;
      },
      onBlocked(entity, world, actorId, error) {
        if (error === 'story.fireplace.switch_on') {
          const events = doBurnFireplace(world, actorId);
          return events.map(e => createEffect(e.type, e.data as Record<string, any>));
        }
        return null;
      },
    },
  },

  // --- OPENING — wall safe combo puzzle (stdlib checks interceptors ✓) ---
  {
    actionId: 'if.action.opening',
    interceptor: {
      preValidate(entity, world) {
        const id = entity.get(PuzzlePropTrait)?.propId;
        if (id !== 'wall-safe') return null;

        const lockable = entity.get(LockableTrait);
        if (!lockable?.isLocked) return null; // Standard opening if unlocked

        const lit = world.getStateValue('fireplace-lit') as boolean;
        if (!lit) return { valid: false, error: 'story.safe.no_combo' };

        // Player knows the combo — unlock and open
        lockable.isLocked = false;
        const openable = entity.get(OpenableTrait);
        if (openable) openable.isOpen = true;
        world.awardScore('safe-opened', 1, 'Opening the wall safe');
        return { valid: false, error: 'story.safe.combo_success' };
      },
      onBlocked(entity, world, actorId, error) {
        if (error === 'story.safe.no_combo') {
          return [createEffect('game.message', { messageId: 'story.custom', params: { fallback: "The safe has a three-dial combination lock. You don't know the combination yet." } })];
        }
        if (error === 'story.safe.combo_success') {
          return [createEffect('game.message', { messageId: 'story.custom', params: { fallback: 'You dial 7-3-9. The safe clicks open.' } })];
        }
        return null;
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Burning interceptor — special: applies to fireplace, matchbook, hearthstone
// Sharpee doesn't have a built-in burn action, so we handle it as a custom action
// ---------------------------------------------------------------------------

const burningAction: Action = {
  id: 'if.action.burning',
  group: 'special',

  validate(context: ActionContext): ValidationResult {
    const target = context.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(context: ActionContext): ISemanticEvent[] {
    const target = context.validationResult!.data!.target as IFEntity;
    const world = context.world;
    const playerId = context.player.id;

    const fpId = entityIds['fireplace'];
    const hsId = entityIds['hearthstone'];
    const matchId = entityIds['matchbook'];
    const studyId = entityIds['study'];

    // Burning fireplace, hearthstone, or matchbook (in study) → light fireplace
    if (target.id === fpId || target.id === hsId) {
      return doBurnFireplace(world, playerId, context);
    }

    if (target.id === matchId) {
      const loc = world.getLocation(playerId);
      if (loc === studyId) {
        const result = doBurnFireplace(world, playerId, context);
        return [msg('(lighting the fireplace)\n', context), ...result];
      }
      return [msg("There's nothing useful to light here.", context)];
    }

    return [msg("You can't burn that.", context)];
  },
};

// ---------------------------------------------------------------------------
// #4: Combining action — "combine X with Y" → inserting into music box
// (I7: custom combining action → try inserting it into)
// ---------------------------------------------------------------------------

const combiningAction: Action = {
  id: 'story.action.combining',
  group: 'special',

  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    const other = ctx.command.indirectObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target, other } };
  },

  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    const other = ctx.validationResult!.data!.other as IFEntity | undefined;
    const world = ctx.world;
    const musicBoxId = entityIds['music-box'];

    // Determine which is the item and which is the container
    let item: IFEntity | undefined;
    if (other?.id === musicBoxId) {
      item = target;
    } else if (target.id === musicBoxId && other) {
      item = other;
    }

    if (item && musicBoxId) {
      if (world.getLocation(item.id) !== ctx.player.id) {
        return [msg(`You're not carrying ${item.get(IdentityTrait)?.name ?? 'that'}.`, ctx)];
      }
      world.moveEntity(item.id, musicBoxId);
      const itemName = item.get(IdentityTrait)?.name ?? 'it';
      return [msg(`(putting ${itemName} in the music box)\n\nYou place ${itemName} inside the music box.`, ctx)];
    }

    const tName = target.get(IdentityTrait)?.name ?? 'that';
    return [msg(`You can't combine those. Try PUT ${tName.toUpperCase()} IN something.`, ctx)];
  },
};

// ---------------------------------------------------------------------------
// #7: Wearing action — "wear overcoat" → too moth-eaten
// (I7: Instead of wearing the old overcoat)
// Wearing is in the list of stdlib actions that don't check interceptors,
// so we override the verb entirely with a custom action.
// ---------------------------------------------------------------------------

const storyWearingAction: Action = {
  id: 'story.action.wearing',
  group: 'manipulation',

  validate(ctx: ActionContext): ValidationResult {
    const target = ctx.command.directObject?.entity;
    if (!target) return { valid: false, error: 'no_target' };
    return { valid: true, data: { target } };
  },

  execute(ctx: ActionContext): ISemanticEvent[] {
    const target = ctx.validationResult!.data!.target as IFEntity;
    if (propId(target) === 'overcoat') {
      return [msg('The coat is too moth-eaten to wear. But you could search the pockets.', ctx)];
    }
    return [msg(`You can't wear ${target.get(IdentityTrait)?.name ?? 'that'}.`, ctx)];
  },
};

// ---------------------------------------------------------------------------
// #10: Dialing action — "dial 7-3-9" → open wall safe
// (I7 CANNOT do this: entering numbers requires I6 token definitions.
//  Sharpee handles it via grammar builder greedy text capture.)
// ---------------------------------------------------------------------------

const dialingAction: Action = {
  id: 'story.action.dialing',
  group: 'special',

  validate(): ValidationResult {
    return { valid: true };
  },

  execute(ctx: ActionContext): ISemanticEvent[] {
    const world = ctx.world;
    const code = ctx.command.parsed?.textSlots?.get('code') ?? '';

    // Must be in the study
    const studyId = entityIds['study'];
    const loc = world.getLocation(ctx.player.id);
    if (loc !== studyId) {
      return [msg("There's nothing here to dial a combination on.", ctx)];
    }

    // Safe must be visible (painting moved)
    const paintingMoved = world.getStateValue('painting-moved') as boolean;
    if (!paintingMoved) {
      return [msg("You don't see anything to dial a combination on.", ctx)];
    }

    // Check if safe is already open
    const safeId = entityIds['wall-safe'];
    if (safeId) {
      const safe = world.getEntity(safeId);
      if (safe) {
        const lockable = safe.get(LockableTrait);
        if (lockable && !lockable.isLocked) {
          return [msg('The safe is already open.', ctx)];
        }
      }
    }

    // Normalize the code: strip spaces, hyphens, punctuation
    const normalized = code.replace(/[\s\-.,]/g, '');
    if (normalized === '739') {
      if (safeId) {
        const safe = world.getEntity(safeId);
        if (safe) {
          const lockable = safe.get(LockableTrait);
          const openable = safe.get(OpenableTrait);
          if (lockable) lockable.isLocked = false;
          if (openable) openable.isOpen = true;
          world.awardScore('safe-opened', 1, 'Opening the wall safe');
          return [msg('You dial 7-3-9. The safe clicks open.', ctx)];
        }
      }
    }

    return [msg(`You dial ${code}. Nothing happens.`, ctx)];
  },
};

// ---------------------------------------------------------------------------
// Score/turn tracking: win condition check via TurnPlugin
// ---------------------------------------------------------------------------

const winCheckPlugin = {
  id: 'story.win-check',
  priority: 1000,

  onAfterAction(context: { world: WorldModel }): ISemanticEvent[] {
    const score = context.world.getScore();
    if (score >= 10) {
      return [
        msg("\nYou found your grandmother's heirloom. The locket feels warm against your palm."),
        createEvent('game.ended', { reason: 'victory', message: 'You have won' }),
      ];
    }
    return [];
  },
};

// ---------------------------------------------------------------------------
// First-take scoring for locket: handled via TurnPlugin postAction
// (winding key uses IdentityTrait.points; locket also does)
// ---------------------------------------------------------------------------

const firstTakePlugin = {
  id: 'story.first-take',
  priority: 100,

  onAfterAction(context: { world: WorldModel; actionResult?: { actionId: string; targetId?: string; success: boolean } }): ISemanticEvent[] {
    if (!context.actionResult?.success) return [];
    if (context.actionResult.actionId !== 'if.action.taking') return [];

    const targetId = context.actionResult.targetId;
    if (!targetId) return [];

    const locketId = entityIds['locket'];
    if (targetId === locketId) {
      // Custom locket-taking message
      return [msg("You lift the locket from the trunk. Inside, your grandmother smiles back at you from a faded photograph. This is what she wanted you to have.")];
    }

    return [];
  },
};

// ---------------------------------------------------------------------------
// Dynamic description updater: desk shows open/closed, music box shows contents
// ---------------------------------------------------------------------------

const descriptionPlugin = {
  id: 'story.descriptions',
  priority: 50,

  onAfterAction(context: { world: WorldModel }): ISemanticEvent[] {
    const world = context.world;

    // Update desk description based on open/closed state
    const deskId = entityIds['desk'];
    if (deskId) {
      const desk = world.getEntity(deskId);
      if (desk) {
        const identity = desk.get(IdentityTrait);
        const openable = desk.get(OpenableTrait);
        if (identity && openable) {
          const state = openable.isOpen ? 'open' : 'closed';
          identity.description = `A mahogany desk with brass handles. The drawers are ${state}.`;
        }
      }
    }

    // Update music box description based on contents
    const mbId = entityIds['music-box'];
    if (mbId) {
      const mb = world.getEntity(mbId);
      if (mb) {
        const identity = mb.get(IdentityTrait);
        if (identity) {
          const contents = world.getContents(mbId);
          const count = contents.length;
          if (count === 0) {
            identity.description = "A wooden music box with a rose-carved lid and a small keyhole on the side. Inside, the cavity is empty -- the mechanism has been removed.";
          } else if (count === 1) {
            identity.description = "A wooden music box with a rose-carved lid and a small keyhole on the side. One part has been placed inside, but something is still missing.";
          } else {
            identity.description = "A wooden music box with a rose-carved lid and a small keyhole on the side. The mechanism and spring are both in place. It looks ready to be wound.";
          }
        }
      }
    }

    // Update trunk description based on lock state
    const trunkId = entityIds['trunk'];
    if (trunkId) {
      const trunk = world.getEntity(trunkId);
      if (trunk) {
        const identity = trunk.get(IdentityTrait);
        const lockable = trunk.get(LockableTrait);
        if (identity && lockable) {
          if (lockable.isLocked) {
            identity.description = "A battered steamer trunk with brass fittings. The lock has no keyhole -- just a small slot that looks mechanically connected to the shelf above.";
          } else {
            identity.description = "A battered steamer trunk with brass fittings. The mechanical lock has sprung open.";
          }
        }
      }
    }

    // Update wall safe visibility
    const safeId = entityIds['wall-safe'];
    if (safeId) {
      const safe = world.getEntity(safeId);
      if (safe) {
        const identity = safe.get(IdentityTrait);
        if (identity) {
          const moved = world.getStateValue('painting-moved') as boolean;
          identity.concealed = !moved;
        }
      }
    }

    return [];
  },
};

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const story: Story = {
  config,

  // -----------------------------------------------------------------------
  // Player
  // -----------------------------------------------------------------------

  createPlayer(world: WorldModel): IFEntity {
    const player = world.getPlayer()!;
    player.add(new IdentityTrait({
      name: 'yourself',
      aliases: ['self', 'me'],
      properName: true,
    }));
    player.add(new ActorTrait({ isPlayer: true }));
    player.add(new ContainerTrait({ capacity: { maxItems: 15 } }));
    return player;
  },

  // -----------------------------------------------------------------------
  // World
  // -----------------------------------------------------------------------

  initializeWorld(world: WorldModel): void {
    const player = world.getPlayer()!;

    // === Scoring ===
    world.setMaxScore(10);

    // =====================================================================
    // ROOMS
    // =====================================================================

    const porch = world.createEntity('Front Porch', 'room');
    porch.add(new IdentityTrait({
      name: 'Front Porch',
      description: "A sagging wooden porch wraps around the front of the house. A woven doormat lies before the front door. A tarnished brass doorbell is set beside the frame.\n\nThe front door leads inside to the east.",
      properName: true,
    }));
    porch.add(new RoomTrait({ tags: ['start'] }));
    entityIds['porch'] = porch.id;

    const hallway = world.createEntity('Hallway', 'room');
    hallway.add(new IdentityTrait({
      name: 'Hallway',
      description: "A dim hallway with faded wallpaper and creaking floorboards. A coat rack stands by the door with an old overcoat hanging from it.\n\nDoors lead east to a study and south to the kitchen. A narrow staircase leads up.",
      properName: true,
    }));
    hallway.add(new RoomTrait());

    const study = world.createEntity('Study', 'room');
    study.add(new IdentityTrait({
      name: 'Study',
      description: "A wood-paneled study with built-in bookshelves. A heavy desk sits in the center, its drawers shut. An oil painting of a woman hangs on the far wall. A stone fireplace squats in the corner, cold and dark.\n\nThe hallway is back to the west.",
      properName: true,
    }));
    study.add(new RoomTrait());
    entityIds['study'] = study.id;

    const kitchen = world.createEntity('Kitchen', 'room');
    kitchen.add(new IdentityTrait({
      name: 'Kitchen',
      description: "A rustic kitchen with stone counters and a deep ceramic sink. Copper pots hang from hooks above. A handwritten recipe card sits on the counter.\n\nThe hallway is north. A doorway leads south to the garden.",
      properName: true,
    }));
    kitchen.add(new RoomTrait());

    const garden = world.createEntity('Garden', 'room');
    garden.add(new IdentityTrait({
      name: 'Garden',
      description: "An overgrown garden behind the house. A flower bed runs along the back wall, thick with weeds. A small shed leans in one corner with its door ajar. A rusty trowel leans against the shed.\n\nThe kitchen doorway is back to the north.",
      properName: true,
    }));
    garden.add(new RoomTrait({ outdoor: true }));
    entityIds['garden'] = garden.id;

    const attic = world.createEntity('Attic', 'room');
    attic.add(new IdentityTrait({
      name: 'Attic',
      description: "A cramped attic under sloping eaves, thick with dust. A dusty shelf holds an old music box. A heavy steamer trunk sits against the wall.\n\nThe stairs lead back down.",
      properName: true,
    }));
    attic.add(new RoomTrait());

    // =====================================================================
    // ROOM CONNECTIONS
    // =====================================================================

    const ironKey = world.createEntity('iron key', 'item');
    ironKey.add(new IdentityTrait({
      name: 'iron key',
      description: 'A heavy iron key, dark with age.',
      aliases: ['old key', 'heavy key', 'house key', 'key'],
      adjectives: ['iron', 'heavy', 'old'],
      article: 'an',
    }));
    entityIds['iron-key'] = ironKey.id;
    // Starts nowhere — revealed by looking under doormat

    const frontDoor = world.createDoor('front door', {
      room1Id: porch.id,
      room2Id: hallway.id,
      direction: Direction.EAST,
      description: 'A heavy oak door with peeling green paint and an old-fashioned keyhole.',
      aliases: ['oak door', 'door', 'keyhole'],
      isOpen: false,
      isLocked: true,
      keyId: ironKey.id,
    });
    const frontDoorIdentity = frontDoor.get(IdentityTrait);
    if (frontDoorIdentity) {
      frontDoorIdentity.adjectives = ['front', 'oak', 'heavy', 'green'];
    }
    entityIds['front-door'] = frontDoor.id;

    world.connectRooms(hallway.id, study.id, Direction.EAST);
    world.connectRooms(hallway.id, kitchen.id, Direction.SOUTH);
    world.connectRooms(hallway.id, attic.id, Direction.UP);
    world.connectRooms(kitchen.id, garden.id, Direction.SOUTH);

    // =====================================================================
    // FRONT PORCH OBJECTS
    // =====================================================================

    scenery(world, 'woven doormat', porch,
      "A faded doormat reading 'WELCOME'. One corner is curled up -- something glints underneath.",
      { aliases: ['mat', 'rug', 'welcome mat', 'doormat'], adjectives: ['woven', 'faded'], propId: 'doormat' });

    scenery(world, 'brass doorbell', porch,
      'A tarnished brass button set into the door frame.',
      { aliases: ['bell', 'button', 'buzzer', 'door bell', 'doorbell', 'door frame'], adjectives: ['brass', 'tarnished'], propId: 'doorbell' });

    scenery(world, 'sagging porch', porch,
      'Weathered boards that sag under your weight. The paint peeled away long ago.',
      { aliases: ['porch', 'boards', 'railing'], adjectives: ['sagging', 'wooden', 'weathered'], article: 'the' });

    // =====================================================================
    // HALLWAY OBJECTS
    // =====================================================================

    scenery(world, 'coat rack', hallway,
      'A wooden coat rack, slightly tilted. An old overcoat hangs from one hook.',
      { aliases: ['rack', 'hook', 'hooks', 'stand'], adjectives: ['wooden', 'tilted'], article: 'the', propId: 'coat-rack' });

    const overcoat = scenery(world, 'old overcoat', hallway,
      'A moth-eaten wool overcoat. The pockets look like they might hold something.',
      { aliases: ['coat', 'jacket', 'overcoat', 'wool coat', 'dusty coat', 'pockets', 'pocket'], adjectives: ['old', 'moth-eaten', 'wool'], article: 'an', propId: 'overcoat' });
    overcoat.scope('if.action.examining', 150);
    overcoat.scope('if.action.searching', 150);
    overcoat.scope('if.action.taking', 150);

    scenery(world, 'narrow staircase', hallway,
      'A wooden staircase with groaning steps. It leads up into shadows.',
      { aliases: ['stairs', 'staircase', 'steps', 'stair'], adjectives: ['narrow', 'wooden', 'groaning'], article: 'a', propId: 'staircase' });

    scenery(world, 'faded wallpaper', hallway,
      'Yellowed wallpaper with a faded floral pattern, peeling at the seams.',
      { aliases: ['wallpaper', 'wall', 'walls', 'paper'], adjectives: ['faded', 'yellowed', 'floral'], article: 'the' });

    scenery(world, 'creaking floorboards', hallway,
      'Dark wooden floorboards that creak underfoot.',
      { aliases: ['floor', 'floorboard', 'boards', 'floorboards'], adjectives: ['creaking', 'dark', 'wooden'], article: 'the', grammaticalNumber: 'plural' });

    const matchbook = world.createEntity('matchbook', 'item');
    matchbook.add(new IdentityTrait({
      name: 'matchbook',
      description: "A small book of matches from 'The Golden Lantern.' A few matches remain.",
      aliases: ['matches', 'match', 'book of matches'],
      adjectives: ['small'],
      article: 'a',
    }));
    entityIds['matchbook'] = matchbook.id;
    // Starts nowhere — revealed by searching overcoat

    // =====================================================================
    // STUDY OBJECTS
    // =====================================================================

    scenery(world, 'study bookshelves', study,
      'Floor-to-ceiling shelves packed with dusty volumes. Nothing stands out.',
      { aliases: ['bookshelves', 'bookshelf', 'shelves', 'books', 'book', 'volumes', 'volume'], adjectives: ['study', 'built-in', 'dusty'], article: 'the', grammaticalNumber: 'plural' });

    const desk = world.createEntity('heavy desk', 'container');
    desk.add(new IdentityTrait({
      name: 'heavy desk',
      description: 'A mahogany desk with brass handles. The drawers are closed.',
      aliases: ['desk', 'drawers', 'drawer', 'mahogany desk', 'handles', 'handle', 'brass handles'],
      adjectives: ['heavy', 'mahogany'],
      article: 'a',
    }));
    desk.add(new ContainerTrait({ isTransparent: false }));
    desk.add(new OpenableTrait({ isOpen: false, canClose: true }));
    desk.add(new SceneryTrait({ cantTakeMessage: 'The desk is far too heavy to carry.' }));
    world.moveEntity(desk.id, study.id);
    entityIds['desk'] = desk.id;

    const windingKey = world.createEntity('winding key', 'item');
    windingKey.add(new IdentityTrait({
      name: 'winding key',
      description: 'A small key shaped like a butterfly, clearly meant for winding something delicate.',
      aliases: ['butterfly key', 'small key', 'delicate key', 'key'],
      adjectives: ['winding', 'butterfly', 'small', 'delicate'],
      article: 'a',
      points: 1,
      pointsDescription: 'Finding the winding key',
    }));
    world.moveEntity(windingKey.id, desk.id);
    entityIds['winding-key'] = windingKey.id;

    scenery(world, 'oil painting', study,
      'A portrait of a stern woman in a high collar -- your grandmother, perhaps. The frame sits slightly askew on the wall.',
      { aliases: ['painting', 'portrait', 'picture', 'frame', 'woman', 'grandmother'], adjectives: ['oil', 'large'], article: 'an', propId: 'painting' });

    const wallSafe = world.createEntity('wall safe', 'container');
    wallSafe.add(new IdentityTrait({
      name: 'wall safe',
      description: 'A small iron safe set into the wall. It has a three-dial combination lock.',
      aliases: ['safe', 'iron safe', 'combination', 'dial', 'dials', 'lock', 'combination lock'],
      adjectives: ['wall', 'iron', 'small'],
      article: 'a',
      concealed: true,
    }));
    wallSafe.add(new ContainerTrait({ isTransparent: false }));
    wallSafe.add(new OpenableTrait({ isOpen: false, canClose: true }));
    wallSafe.add(new LockableTrait({
      isLocked: true,
      lockedMessage: "The safe has a three-dial combination lock. You don't know the combination yet.",
    }));
    wallSafe.add(new SceneryTrait({ cantTakeMessage: 'The safe is embedded in the wall.' }));
    wallSafe.add(new PuzzlePropTrait('wall-safe'));
    world.moveEntity(wallSafe.id, study.id);
    entityIds['wall-safe'] = wallSafe.id;

    const clockSpring = world.createEntity('clock spring', 'item');
    clockSpring.add(new IdentityTrait({
      name: 'clock spring',
      description: 'A tightly coiled metal spring, the kind found inside clockwork.',
      aliases: ['spring', 'coiled spring', 'metal spring', 'coil'],
      adjectives: ['clock', 'coiled', 'metal', 'tightly'],
      article: 'a',
    }));
    world.moveEntity(clockSpring.id, wallSafe.id);
    entityIds['spring'] = clockSpring.id;

    scenery(world, 'stone fireplace', study,
      'A wide stone fireplace with old logs in the grate, ready to burn. The hearthstone is blackened with soot.',
      { aliases: ['fireplace', 'hearth', 'grate', 'fire', 'logs', 'log', 'chimney'], adjectives: ['stone', 'wide', 'cold'], article: 'the', propId: 'fireplace' });

    scenery(world, 'hearthstone', study,
      'A broad flat stone at the base of the fireplace, blackened with soot. Hard to make out any detail.',
      { aliases: ['hearth stone', 'soot'], adjectives: ['broad', 'flat', 'blackened'], article: 'the', propId: 'hearthstone' });

    scenery(world, 'wood paneling', study,
      'Dark wood panels line the walls, polished but dusty.',
      { aliases: ['paneling', 'panels', 'panel', 'wood'], adjectives: ['wood', 'dark', 'polished'], article: 'the' });

    // =====================================================================
    // KITCHEN OBJECTS
    // =====================================================================

    scenery(world, 'stone counters', kitchen,
      'Heavy stone countertops, cracked but solid.',
      { aliases: ['counter', 'countertop', 'countertops'], adjectives: ['stone', 'heavy', 'cracked'], article: 'the', grammaticalNumber: 'plural' });

    scenery(world, 'ceramic sink', kitchen,
      'A deep farmhouse sink with a brass faucet. It drips slowly.',
      { aliases: ['sink', 'faucet', 'tap', 'basin'], adjectives: ['ceramic', 'deep', 'farmhouse'], article: 'the', propId: 'sink' });

    scenery(world, 'copper pots', kitchen,
      'Tarnished copper pots hanging from iron hooks. Decorative now.',
      { aliases: ['pots', 'pans', 'pot', 'pan', 'hooks', 'iron hooks'], adjectives: ['copper', 'tarnished'], article: 'the', grammaticalNumber: 'plural' });

    const recipeCard = scenery(world, 'recipe card', kitchen,
      "Your grandmother's handwriting: 'Lavender shortbread -- butter, sugar, flour, and dried lavender from the garden.' The card is stained and well-loved.",
      { aliases: ['recipe', 'card', 'note', 'handwritten'], adjectives: ['recipe', 'handwritten', 'stained'], article: 'the' });
    recipeCard.add(new ReadableTrait({
      text: 'Lavender shortbread -- butter, sugar, flour, and dried lavender from the garden.',
      isReadable: true,
      readableType: 'card',
    }));

    // =====================================================================
    // GARDEN OBJECTS
    // =====================================================================

    scenery(world, 'flower bed', garden,
      'A raised bed of dark soil tangled with dead weeds. The earth looks soft -- someone was digging here recently.',
      { aliases: ['bed', 'flowers', 'weeds', 'soil', 'dirt', 'earth', 'ground'], adjectives: ['flower', 'raised', 'dark'], article: 'the', propId: 'flower-bed' });

    scenery(world, 'garden shed', garden,
      'A small wooden shed with a sagging roof. The door hangs open, revealing empty shelves and cobwebs inside.',
      { aliases: ['shed', 'shack', 'door', 'shed door', 'shelves', 'cobwebs', 'roof'], adjectives: ['garden', 'wooden', 'small', 'sagging'], article: 'the' });

    const trowel = world.createEntity('garden trowel', 'item');
    trowel.add(new IdentityTrait({
      name: 'garden trowel',
      description: 'A short-handled garden trowel, rusty but solid.',
      aliases: ['trowel', 'spade', 'shovel', 'tool'],
      adjectives: ['garden', 'rusty', 'short-handled'],
      article: 'a',
    }));
    world.moveEntity(trowel.id, garden.id);
    entityIds['trowel'] = trowel.id;

    const mechanism = world.createEntity('brass mechanism', 'item');
    mechanism.add(new IdentityTrait({
      name: 'brass mechanism',
      description: "A small brass mechanism -- gears, pins, and a tiny drum with raised bumps. The innards of a music box.",
      aliases: ['mechanism', 'gears', 'gear', 'clockwork', 'innards', 'drum', 'pins', 'pin'],
      adjectives: ['brass', 'small'],
      article: 'a',
    }));
    entityIds['mechanism'] = mechanism.id;
    // Starts nowhere — revealed by digging

    // =====================================================================
    // ATTIC OBJECTS
    // =====================================================================

    const shelf = world.createEntity('dusty shelf', 'supporter');
    shelf.add(new IdentityTrait({
      name: 'dusty shelf',
      description: 'A rough plank shelf nailed to the wall studs.',
      aliases: ['shelf', 'plank', 'shelves'],
      adjectives: ['dusty', 'rough'],
      article: 'a',
    }));
    shelf.add(new SupporterTrait());
    shelf.add(new SceneryTrait({ cantTakeMessage: 'The shelf is nailed to the wall.' }));
    world.moveEntity(shelf.id, attic.id);

    const musicBox = world.createEntity('old music box', 'container');
    musicBox.add(new IdentityTrait({
      name: 'old music box',
      description: "A wooden music box with a rose-carved lid and a small keyhole on the side. Inside, the cavity is empty -- the mechanism has been removed.",
      aliases: ['box', 'music box', 'wooden box', 'lid', 'keyhole'],
      adjectives: ['old', 'wooden', 'music', 'rose-carved'],
      article: 'an',
    }));
    musicBox.add(new ContainerTrait({ capacity: { maxItems: 2 }, isTransparent: false }));
    musicBox.add(new OpenableTrait({ isOpen: true, canClose: true }));
    world.moveEntity(musicBox.id, shelf.id);
    entityIds['music-box'] = musicBox.id;

    const trunk = world.createEntity('steamer trunk', 'container');
    trunk.add(new IdentityTrait({
      name: 'steamer trunk',
      description: "A battered steamer trunk with brass fittings. The lock has no keyhole -- just a small slot that looks mechanically connected to the shelf above.",
      aliases: ['trunk', 'chest', 'old trunk', 'steamer', 'fittings', 'brass fittings', 'slot'],
      adjectives: ['steamer', 'battered', 'heavy'],
      article: 'a',
    }));
    trunk.add(new ContainerTrait({ isTransparent: false }));
    trunk.add(new OpenableTrait({ isOpen: false, canClose: true }));
    trunk.add(new LockableTrait({
      isLocked: true,
      lockedMessage: 'The trunk has no keyhole. The lock seems mechanically connected to the shelf above.',
    }));
    trunk.add(new SceneryTrait({ cantTakeMessage: 'The trunk is far too heavy to lift.' }));
    trunk.add(new PuzzlePropTrait('trunk'));
    world.moveEntity(trunk.id, attic.id);
    entityIds['trunk'] = trunk.id;

    const locket = world.createEntity('family locket', 'item');
    locket.add(new IdentityTrait({
      name: 'family locket',
      description: 'A silver locket on a fine chain. Inside, a tiny photograph shows your grandmother as a young woman, smiling.',
      aliases: ['locket', 'silver locket', 'heirloom', 'necklace', 'chain', 'photograph', 'photo'],
      adjectives: ['family', 'silver', 'fine'],
      article: 'a',
      points: 2,
      pointsDescription: "Finding grandmother's heirloom",
    }));
    world.moveEntity(locket.id, trunk.id);
    entityIds['locket'] = locket.id;

    scenery(world, 'sloping eaves', attic,
      'Low rafters and dusty beams. You have to duck in places.',
      { aliases: ['eaves', 'rafters', 'beams', 'ceiling', 'roof', 'wall', 'dust'], adjectives: ['sloping', 'low', 'dusty'], article: 'the', grammaticalNumber: 'plural' });

    // =====================================================================
    // DISAMBIGUATION SCOPE PRIORITIES
    // =====================================================================

    ironKey.scope('if.action.unlocking', 150);
    windingKey.scope('if.action.winding', 150);
    musicBox.scope('if.action.winding', 150);

    // =====================================================================
    // GAME STATE
    // =====================================================================

    world.setStateValue('painting-moved', false);
    world.setStateValue('fireplace-lit', false);

    // =====================================================================
    // REGISTER INTERCEPTORS
    // =====================================================================

    for (const { actionId, interceptor } of puzzleInterceptors) {
      registerActionInterceptor(PuzzlePropTrait.type, actionId, interceptor);
    }

    // =====================================================================
    // PLACE PLAYER
    // =====================================================================

    world.moveEntity(player.id, porch.id);
  },

  // -----------------------------------------------------------------------
  // Custom actions
  // -----------------------------------------------------------------------

  getCustomActions(): any[] {
    return [
      diggingAction,
      diggingHereAction,
      windingAction,
      ringingAction,
      knockingAction,
      lookingBehindAction,
      lookingUnderAction,
      storySearchingAction,
      storyPullingAction,
      storyTurningAction,
      storyClimbingAction,
      storyUnlockingAction,
      repairingAction,
      helpAction,
      verbsAction,
      useAction,
      useWithAction,
      burningAction,
      combiningAction,
      storyWearingAction,
      dialingAction,
    ];
  },

  // -----------------------------------------------------------------------
  // Parser extensions
  // -----------------------------------------------------------------------

  extendParser(parser: Parser): void {
    // =======================================================================
    // Vocabulary — word-level synonyms
    // These map alternate words to canonical verbs/directions so that all
    // stdlib patterns for the canonical verb also work with the synonym.
    // =======================================================================

    parser.registerVocabulary?.([
      // Examination synonyms
      { word: 'inspect', partOfSpeech: 'verb', mapsTo: 'examine', priority: 80, source: 'story' },
      { word: 'study', partOfSpeech: 'verb', mapsTo: 'examine', priority: 80, source: 'story' },
      { word: 'view', partOfSpeech: 'verb', mapsTo: 'examine', priority: 80, source: 'story' },
      { word: 'peruse', partOfSpeech: 'verb', mapsTo: 'examine', priority: 80, source: 'story' },
      { word: 'browse', partOfSpeech: 'verb', mapsTo: 'examine', priority: 80, source: 'story' },
      { word: 'flip', partOfSpeech: 'verb', mapsTo: 'examine', priority: 80, source: 'story' },

      // Taking synonyms
      { word: 'grab', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'collect', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'acquire', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'snag', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'fetch', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'obtain', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'steal', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'nab', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },
      { word: 'lift', partOfSpeech: 'verb', mapsTo: 'take', priority: 80, source: 'story' },

      // Looking synonyms
      { word: 'peek', partOfSpeech: 'verb', mapsTo: 'look', priority: 80, source: 'story' },
      { word: 'peer', partOfSpeech: 'verb', mapsTo: 'look', priority: 80, source: 'story' },
      { word: 'gaze', partOfSpeech: 'verb', mapsTo: 'look', priority: 80, source: 'story' },

      // Going synonyms
      { word: 'proceed', partOfSpeech: 'verb', mapsTo: 'go', priority: 80, source: 'story' },
      { word: 'head', partOfSpeech: 'verb', mapsTo: 'go', priority: 80, source: 'story' },

      // Opening synonyms
      { word: 'pry', partOfSpeech: 'verb', mapsTo: 'open', priority: 80, source: 'story' },
      { word: 'force', partOfSpeech: 'verb', mapsTo: 'open', priority: 80, source: 'story' },

      // Pushing synonyms
      { word: 'shove', partOfSpeech: 'verb', mapsTo: 'push', priority: 80, source: 'story' },
      { word: 'prod', partOfSpeech: 'verb', mapsTo: 'push', priority: 80, source: 'story' },

      // Pulling synonyms
      { word: 'yank', partOfSpeech: 'verb', mapsTo: 'pull', priority: 80, source: 'story' },

      // Dropping synonyms
      { word: 'toss', partOfSpeech: 'verb', mapsTo: 'drop', priority: 80, source: 'story' },

      // Putting synonyms
      { word: 'place', partOfSpeech: 'verb', mapsTo: 'put', priority: 80, source: 'story' },

      // Search synonyms
      { word: 'rummage', partOfSpeech: 'verb', mapsTo: 'search', priority: 80, source: 'story' },

      // Combat synonyms (#8)
      { word: 'strike', partOfSpeech: 'verb', mapsTo: 'attack', priority: 80, source: 'story' },
      { word: 'stab', partOfSpeech: 'verb', mapsTo: 'attack', priority: 80, source: 'story' },
      { word: 'slash', partOfSpeech: 'verb', mapsTo: 'attack', priority: 80, source: 'story' },
      { word: 'kick', partOfSpeech: 'verb', mapsTo: 'attack', priority: 80, source: 'story' },

      // Eating synonyms (#9)
      { word: 'consume', partOfSpeech: 'verb', mapsTo: 'eat', priority: 80, source: 'story' },
      { word: 'devour', partOfSpeech: 'verb', mapsTo: 'eat', priority: 80, source: 'story' },

      // Direction aliases
      { word: 'upstairs', partOfSpeech: 'direction', mapsTo: 'up', priority: 80, source: 'story' },
      { word: 'downstairs', partOfSpeech: 'direction', mapsTo: 'down', priority: 80, source: 'story' },
    ]);

    // =======================================================================
    // Grammar Builder — ALL verb-to-action mappings
    //
    // Per sharpee.net docs, the grammar builder (parser.getStoryGrammar())
    // is the correct way to register story-specific verb patterns.
    // Priority 150 = story-specific patterns (overrides stdlib at 100).
    //
    // Items marked *** are patterns that Inform 7 CANNOT handle —
    // these showcase Sharpee's parser advantages for the side-by-side demo.
    // =======================================================================

    const grammar = (parser as any).getStoryGrammar?.();
    if (!grammar) {
      console.warn('[Sharpee] getStoryGrammar() not available');
      return;
    }

    try {
    // --- Looking under (Front Porch puzzle) ---
    grammar.define('look under :target').mapsTo('story.action.looking-under').withPriority(150).build();
    grammar.define('look underneath :target').mapsTo('story.action.looking-under').withPriority(150).build();
    grammar.define('look beneath :target').mapsTo('story.action.looking-under').withPriority(150).build();
    grammar.define('search under :target').mapsTo('story.action.looking-under').withPriority(150).build();
    grammar.define('search underneath :target').mapsTo('story.action.looking-under').withPriority(150).build();
    grammar.define('search beneath :target').mapsTo('story.action.looking-under').withPriority(150).build();

    // --- Looking behind (Study puzzle) ---
    grammar.define('look behind :target').mapsTo('story.action.looking-behind').withPriority(150).build();
    grammar.define('check behind :target').mapsTo('story.action.looking-behind').withPriority(150).build();

    // --- Ringing ---
    grammar.define('ring :target').mapsTo('story.action.ringing').withPriority(150).build();

    // --- Knocking ---
    grammar.define('knock :target').mapsTo('story.action.knocking').withPriority(150).build();
    grammar.define('knock on :target').mapsTo('story.action.knocking').withPriority(150).build();
    grammar.define('rap :target').mapsTo('story.action.knocking').withPriority(150).build();
    grammar.define('rap on :target').mapsTo('story.action.knocking').withPriority(150).build();

    // --- Digging ---
    grammar.define('dig :target').mapsTo('story.action.digging').withPriority(150).build();
    grammar.define('dig in :target').mapsTo('story.action.digging').withPriority(150).build();
    grammar.define('dig up :target').mapsTo('story.action.digging').withPriority(150).build();
    grammar.define('excavate :target').mapsTo('story.action.digging').withPriority(150).build();
    grammar.define('dig').mapsTo('story.action.digging-here').withPriority(150).build();
    grammar.define('dig here').mapsTo('story.action.digging-here').withPriority(150).build();

    // --- Winding ---
    grammar.define('wind :target').mapsTo('story.action.winding').withPriority(150).build();
    grammar.define('wind up :target').mapsTo('story.action.winding').withPriority(150).build();
    grammar.define('crank :target').mapsTo('story.action.winding').withPriority(150).build();
    grammar.define('crank up :target').mapsTo('story.action.winding').withPriority(150).build();

    // --- Repairing ---
    grammar.define('fix :target').mapsTo('story.action.repairing').withPriority(150).build();
    grammar.define('repair :target').mapsTo('story.action.repairing').withPriority(150).build();
    grammar.define('assemble :target').mapsTo('story.action.repairing').withPriority(150).build();
    grammar.define('mend :target').mapsTo('story.action.repairing').withPriority(150).build();

    // --- Searching (overrides stdlib search) ---
    grammar.define('search :target').mapsTo('story.action.searching').withPriority(150).build();
    grammar.define('rummage :target').mapsTo('story.action.searching').withPriority(150).build();

    // --- Pulling (overrides stdlib pull) ---
    grammar.define('pull :target').mapsTo('story.action.pulling').withPriority(150).build();
    grammar.define('yank :target').mapsTo('story.action.pulling').withPriority(150).build();
    grammar.define('drag :target').mapsTo('story.action.pulling').withPriority(150).build();

    // --- Turning (overrides stdlib turn) ---
    grammar.define('turn :target').mapsTo('story.action.turning').withPriority(150).build();
    grammar.define('rotate :target').mapsTo('story.action.turning').withPriority(150).build();
    grammar.define('twist :target').mapsTo('story.action.turning').withPriority(150).build();

    // --- Climbing (overrides stdlib climb) ---
    grammar.define('climb :target').mapsTo('story.action.climbing').withPriority(150).build();
    grammar.define('scale :target').mapsTo('story.action.climbing').withPriority(150).build();

    // --- Unlocking ---
    // Two-noun "unlock X with Y" must be higher priority than bare "unlock X"
    // so the parser doesn't consume "unlock door" and ignore "with iron key".
    grammar.define('unlock :target with :key').mapsTo('if.action.unlocking').withPriority(160).build();
    grammar.define('unlock :target').mapsTo('story.action.unlocking').withPriority(150).build();

    // --- Burning (fire synonyms) ---
    grammar.define('burn :target').mapsTo('if.action.burning').withPriority(150).build();
    grammar.define('kindle :target').mapsTo('if.action.burning').withPriority(150).build();
    grammar.define('ignite :target').mapsTo('if.action.burning').withPriority(150).build();
    grammar.define('start :target').mapsTo('if.action.burning').withPriority(150).build();
    grammar.define('light :target').mapsTo('if.action.burning').withPriority(150).build();

    // --- Assembly synonyms → inserting ---
    grammar.define('attach :item to :container').mapsTo('if.action.inserting').withPriority(150).build();
    grammar.define('install :item in :container').mapsTo('if.action.inserting').withPriority(150).build();
    grammar.define('install :item into :container').mapsTo('if.action.inserting').withPriority(150).build();

    // --- #4: Combining ---
    grammar.define('combine :item with :other').mapsTo('story.action.combining').withPriority(150).build();

    // --- #7: Wearing (overrides stdlib wear) ---
    grammar.define('wear :target').mapsTo('story.action.wearing').withPriority(150).build();
    grammar.define('don :target').mapsTo('story.action.wearing').withPriority(150).build();

    // --- Help & Verbs ---
    grammar.define('help').mapsTo('story.action.help').withPriority(150).build();
    grammar.define('hint').mapsTo('story.action.help').withPriority(150).build();
    grammar.define('hints').mapsTo('story.action.help').withPriority(150).build();
    grammar.define('help me').mapsTo('story.action.help').withPriority(150).build();
    grammar.define('verbs').mapsTo('story.action.verbs').withPriority(150).build();
    grammar.define('commands').mapsTo('story.action.verbs').withPriority(150).build();

    // --- USE handler ---
    grammar.define('use :target').mapsTo('story.action.use').withPriority(150).build();
    grammar.define('use :target on :other').mapsTo('story.action.use-with').withPriority(150).build();
    grammar.define('use :target with :other').mapsTo('story.action.use-with').withPriority(150).build();

    // --- "look X" as examine (players expect "look doorbell" to work) ---
    grammar.define('look :target').mapsTo('if.action.examining').withPriority(140).build();

    // --- #2: "look around" ---
    grammar.define('look around').mapsTo('if.action.looking').withPriority(150).build();

    // --- #5: "wind X with Y" — two-noun winding ---
    grammar.define('wind :target with :tool').mapsTo('story.action.winding').withPriority(150).build();
    grammar.define('wind up :target with :tool').mapsTo('story.action.winding').withPriority(150).build();
    grammar.define('crank :target with :tool').mapsTo('story.action.winding').withPriority(150).build();

    // --- #10: "dial 7-3-9" — numeric input ---
    // *** I7 CANNOT DO THIS without I6 token definitions. ***
    grammar.define('dial :code...').mapsTo('story.action.dialing').withPriority(150).build();
    grammar.define('set combination [to] :code...').mapsTo('story.action.dialing').withPriority(150).build();
    grammar.define('set dial [to] :code...').mapsTo('story.action.dialing').withPriority(150).build();

    // --- #11: "slide painting" — scoped push synonym ---
    // *** I7 CANNOT add "slide" without affecting all objects. ***
    grammar.define('slide :target').mapsTo('if.action.pushing').withPriority(150).build();

    // --- #12: "dig with trowel" — bare verb + tool ---
    // *** I7 CANNOT parse bare verb + "with" + tool (no direct object). ***
    grammar.define('dig with :tool').mapsTo('story.action.digging-here').withPriority(150).build();
    grammar.define('dig :target with :tool').mapsTo('story.action.digging').withPriority(150).build();

    // --- #13: Conversational prefixes ---
    // *** I7 CANNOT handle "please" / "can I" — parsed as verbs. ***
    grammar.define('[please] go :dir').direction('dir').mapsTo('if.action.going').withPriority(90).build();
    grammar.define('[please] take :target').mapsTo('if.action.taking').withPriority(90).build();
    grammar.define('[please] open :target').mapsTo('if.action.opening').withPriority(90).build();
    grammar.define('[please] close :target').mapsTo('if.action.closing').withPriority(90).build();
    grammar.define('[please] examine :target').mapsTo('if.action.examining').withPriority(90).build();
    grammar.define('[please] look at :target').mapsTo('if.action.examining').withPriority(90).build();
    grammar.define('[please] search :target').mapsTo('story.action.searching').withPriority(90).build();
    grammar.define('[please] push :target').mapsTo('if.action.pushing').withPriority(90).build();
    grammar.define('[please] pull :target').mapsTo('story.action.pulling').withPriority(90).build();
    grammar.define('[please] drop :target').mapsTo('if.action.dropping').withPriority(90).build();

    grammar.define('[can] [i] go :dir').direction('dir').mapsTo('if.action.going').withPriority(85).build();
    grammar.define('[can] [i] take :target').mapsTo('if.action.taking').withPriority(85).build();
    grammar.define('[can] [i] open :target').mapsTo('if.action.opening').withPriority(85).build();
    grammar.define('[can] [i] look at :target').mapsTo('if.action.examining').withPriority(85).build();
    grammar.define('[can] [i] have :target').mapsTo('if.action.taking').withPriority(85).build();

    } catch (err) {
      console.error('[Sharpee] grammar builder error:', err);
    }
  },

  // -----------------------------------------------------------------------
  // Language extensions
  // -----------------------------------------------------------------------

  extendLanguage(language: EnglishLanguageProvider): void {
    // Register a passthrough message template so context.event() calls
    // with messageId 'story.custom' render the fallback text directly.
    // This matches how the Cloak of Darkness registers messages.
    (language as any).addMessage?.('story.custom', '{fallback}');
    (language as any).addMessage?.('game.message.story.custom', '{fallback}');
    (language as any).addMessage?.('action.success.story.custom', '{fallback}');
  },

  // -----------------------------------------------------------------------
  // Engine ready — register plugins
  // -----------------------------------------------------------------------

  onEngineReady(engine: GameEngine): void {
    const pluginRegistry = engine.getPluginRegistry();
    pluginRegistry.register(winCheckPlugin);
    pluginRegistry.register(firstTakePlugin);
    pluginRegistry.register(descriptionPlugin);
  },
};

export default story;
