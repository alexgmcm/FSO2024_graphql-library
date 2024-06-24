const Book = require("./models/book");
const Author = require("./models/author");
const { GraphQLError } = require("graphql");
const jwt = require("jsonwebtoken");
const User = require("./models/user");
const { PubSub } = require("graphql-subscriptions");
const pubsub = new PubSub();

const resolvers = {
  Query: {
    me: (root, args, context) => {
      return context.currentUser;
    },
    bookCount: async () => {
      console.log("bookCount");
      return Book.collection.countDocuments();
    },
    authorCount: async () => {
      console.log("authorCount");
      return Author.collection.countDocuments();
    },
    allBooks: async (root, args) => {
      console.log("allBooks");
      let author_filter = {};
      let genre_filter = {};
      if (args.author) {
        author_filter = { name: args.author };
      }
      if (args.genre) {
        genre_filter = { genres: { $elemMatch: { $eq: args.genre } } };
      }
      //console.log(author_filter);
      //console.log(genre_filter);
      const books = await Book.find(genre_filter).populate({
        path: "author",
        match: author_filter,
        select: "name born",
      });
      //console.log(books);
      return books.filter((b) => b.author);
    },
    allAuthors: async () => {
      console.log("allAuthors");
      return Author.find({});
    },
  },
  Mutation: {
    addBook: async (root, args, { currentUser }) => {
      //Check logged in.
      if (!currentUser) {
        throw new GraphQLError("not authenticated", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        });
      }

      let author = await Author.find({ name: args.author });
      if (author.length == 0) {
        author = new Author({ name: args.author });
        console.log(`new author: ${author}`);
        try {
          await author.save();
        } catch (error) {
          console.log("throwing author error");
          throw new GraphQLError("Saving New Author from Book failed", {
            extensions: {
              code: "BAD_USER_INPUT",
              invalidArgs: args.author,
              error,
            },
          });
        }
      } else {
        console.log(`old author: ${author}`);
        author = new Author(...author);
        console.log(`old author: ${author}`);
      }
      const book = new Book({ ...args, author: author });
      try {
        await book.save();
      } catch (error) {
        console.log("throwing book error");
        throw new GraphQLError("Saving Book failed", {
          extensions: {
            code: "BAD_USER_INPUT",
            invalidArgs: args,
            error,
          },
        });
      }
      pubsub.publish("BOOK_ADDED", { bookAdded: book });

      return book;
    },
    editAuthor: async (root, args, { currentUser }) => {
      //Check logged in.
      if (!currentUser) {
        throw new GraphQLError("not authenticated", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        });
      }

      return Author.findOneAndUpdate(
        { name: args.name },
        { born: args.setBornTo },
        { new: true }
      );
    },
    createUser: async (root, args) => {
      const user = new User({
        username: args.username,
        favoriteGenre: args.favoriteGenre,
      });

      return user.save().catch((error) => {
        throw new GraphQLError("Creating the user failed", {
          extensions: {
            code: "BAD_USER_INPUT",
            invalidArgs: args.username,
            error,
          },
        });
      });
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username });

      if (!user || args.password !== "secret") {
        throw new GraphQLError("wrong credentials", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        });
      }

      const userForToken = {
        username: user.username,
        id: user._id,
      };

      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) };
    },
  },

  Author: {
    bookCount: (root) => {
        console.log("bookCount")
        return Book.collection.countDocuments({ author: root._id })
    },
  },

  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator("BOOK_ADDED"),
    },
  },
};

module.exports = resolvers;
