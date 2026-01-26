import { TokenClassConsts, postfixTokenClass } from '../../common/constants';

/**
 * Dory Dark Hero Theme
 * Based on VS Code Dark+, enhanced for landing page hero screenshot
 */
export const darkThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: '', foreground: 'EFEFF0' },

        { token: postfixTokenClass(TokenClassConsts.COMMENT), foreground: '9A9AA0' },
        { token: postfixTokenClass(TokenClassConsts.COMMENT_QUOTE), foreground: '9A9AA0' },

        { token: postfixTokenClass(TokenClassConsts.KEYWORD), foreground: '6FB1FF' },
        { token: postfixTokenClass(TokenClassConsts.KEYWORD_SCOPE), foreground: '6FB1FF' },

        { token: postfixTokenClass(TokenClassConsts.OPERATOR), foreground: '7EEB8B' },
        { token: postfixTokenClass(TokenClassConsts.OPERATOR_SYMBOL), foreground: '7EEB8B' },
        { token: postfixTokenClass(TokenClassConsts.OPERATOR_KEYWORD), foreground: '6FB1FF' },

        { token: postfixTokenClass(TokenClassConsts.NUMBER), foreground: 'F4D06F' },
        { token: postfixTokenClass(TokenClassConsts.NUMBER_FLOAT), foreground: 'F4D06F' },
        { token: postfixTokenClass(TokenClassConsts.NUMBER_BINARY), foreground: 'F4D06F' },
        { token: postfixTokenClass(TokenClassConsts.NUMBER_OCTAL), foreground: 'F4D06F' },
        { token: postfixTokenClass(TokenClassConsts.NUMBER_HEX), foreground: 'F4D06F' },

        { token: postfixTokenClass(TokenClassConsts.STRING), foreground: 'FFAA45' },
        { token: postfixTokenClass(TokenClassConsts.STRING_ESCAPE), foreground: 'FFAA45' },

        { token: postfixTokenClass(TokenClassConsts.DELIMITER), foreground: 'EED58A' },
        { token: postfixTokenClass(TokenClassConsts.DELIMITER_CURLY), foreground: 'EED58A' },
        { token: postfixTokenClass(TokenClassConsts.DELIMITER_PAREN), foreground: 'EED58A' },
        { token: postfixTokenClass(TokenClassConsts.DELIMITER_SQUARE), foreground: 'EED58A' },

        { token: postfixTokenClass(TokenClassConsts.IDENTIFIER), foreground: 'EFEFF0' },
        { token: postfixTokenClass(TokenClassConsts.IDENTIFIER_QUOTE), foreground: 'EFEFF0' },
        { token: postfixTokenClass(TokenClassConsts.TYPE), foreground: 'EFEFF0' },
        { token: postfixTokenClass(TokenClassConsts.VARIABLE), foreground: 'EFEFF0' },

        { token: postfixTokenClass(TokenClassConsts.BINARY), foreground: 'F45B5B' },
        { token: postfixTokenClass(TokenClassConsts.BINARY_ESCAPE), foreground: 'F45B5B' },

        { token: postfixTokenClass(TokenClassConsts.PREDEFINED), foreground: '7EEB8B' },
    ],

    colors: {
        /* === Core Editor === */
        'editor.foreground': '#F1F1F3',

        "editor.background": "#1C1C1F",

        'editor.lineHighlightBackground': '#1E1E27',

        'editor.selectionBackground': '#3A3A48',

        'editorCursor.foreground': '#F8F8F2',

        'editorLineNumber.foreground': '#6B6B75',

        'editorWhitespace.foreground': '#34343C',

        'editorIndentGuide.background': '#2A2A33',
        'editorIndentGuide.activeBackground': '#3F3F4A',

        'editor.selectionHighlightBorder': '#24242C',

        'editorSuggestWidget.highlightForeground': '#6FB1FF',
        'editorSuggestWidget.focusHighlightForeground': '#6FB1FF',

        'editorBracketHighlight.foreground1': '#F1F1F3',
        'editorBracketHighlight.foreground2': '#F1F1F3',
        'editorBracketHighlight.foreground3': '#F1F1F3',
        'editorBracketHighlight.foreground4': '#F1F1F3',
        'editorBracketHighlight.foreground5': '#F1F1F3',
        'editorBracketHighlight.foreground6': '#F1F1F3',
    },
};
