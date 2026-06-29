import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";

import { slugify } from "@/lib/utils";

const wikiLinkRegex = /\[\[([^\]]+)\]\]$/;

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      label: {
        default: "",
      },
      slug: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-wikilink="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href: `/notes/${HTMLAttributes.slug}`,
        "data-wikilink": "true",
        class:
          "rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary no-underline transition hover:bg-primary/20",
      }),
      `[[${HTMLAttributes.label}]]`,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.label}]]`;
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: wikiLinkRegex,
        type: this.type,
        getAttributes: (match) => ({
          label: match[1],
          slug: slugify(match[1]),
        }),
      }),
    ];
  },
});
