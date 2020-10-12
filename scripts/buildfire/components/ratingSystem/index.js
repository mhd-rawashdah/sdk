if (typeof buildfire == "undefined")
    throw "please add buildfire.js first to use buildfire components";

if (typeof buildfire.components == "undefined") buildfire.components = {};

class Rating {
    constructor(record = {}) {
        if (!record.data) record.data = {};
        this.id = record.id || undefined;
        this.isActive =
            typeof record.data.isActive === "boolean" ? record.data.isActive : true;
        this.createdOn = record.data.createdOn || new Date();
        this.createdBy = record.data.createdBy || undefined;
        this.lastUpdatedOn = record.data.lastUpdatedOn || undefined;
        this.lastUpdatedBy = record.data.lastUpdatedBy || undefined;
        this.deletedOn = record.data.deletedOn || undefined;
        this.deletedBy = record.data.deletedBy || undefined;

        this.user = record.data.user || {
            _id: "",
            displayName: "",
            imageUrl: "",
        };
        this.ratingId = record.data.ratingId || undefined;
        this.rating = record.data.rating || undefined;
        this.comment = record.data.comment || "";
        this.images = record.data.images || [];
    }

    toJSON() {
        return {
            id: this.id,
            isActive: this.isActive,
            createdOn: this.createdOn,
            createdBy: this.createdBy,
            lastUpdatedOn: this.lastUpdatedOn,
            lastUpdatedBy: this.lastUpdatedBy,
            deletedOn: this.deletedOn,
            deletedBy: this.deletedBy,

            user: this.user,
            ratingId: this.ratingId,
            rating: this.rating,
            comment: this.comment,
            images: this.images,
            _buildfire: {
                index: {
                    number1: this.isActive ? 1 : 0,
                    date1: this.createdOn,
                    array1: [this.rating, this.user._id],
                    string1: this.ratingId,
                },
            },
        };
    }
}

class Ratings {
    /**
     * Get Database Tag
     */
    static get TAG() {
        return "rating";
    }

    /**
     * Get List Of Ratings
     * @param {Object} filters Filters object with search operators
     * @param {Function} callback Callback function
     */
    static search(filters, callback) {
        buildfire.appData.search(filters, Ratings.TAG, (err, records) => {
            if (err) return callback(err);
            return callback(
                null,
                records.map((record) => new Rating(record))
            );
        });
    }

    static findRatingByUser(ratingId, userId, callback) {
        Ratings.search(
            {
                filter: {
                    "_buildfire.index.array1": userId,
                    "_buildfire.index.string1": ratingId,
                },
            },
            (err, ratings) => {
                if (err) return callback(err);
                return callback(null, ratings[0]);
            }
        );
    }

    /**
     * Add new rating
     * @param {Rating} rating Instance of rating data class
     * @param {Function} callback Callback function
     */
    static add(rating, callback) {
        if (!(rating instanceof Rating))
            return callback(new Error("Only Rating instance can be used"));

        if (!rating.user || !rating.user._id)
            return callback(new Error("User must be logged in"));

        // Check if there is an existing rating from this user
        Ratings.search(
            {
                filter: {
                    "_buildfire.index.array1": rating.user._id,
                    "_buildfire.index.string1": rating.ratingId,
                },
            },
            (err, ratings) => {
                if (err) return callback(err);
                if (ratings && ratings.length)
                    return callback(new Error("User already rated item"));
                if (!ratings || ratings.length === 0) {
                    rating.createdOn = new Date();

                    buildfire.appData.insert(
                        rating.toJSON(),
                        Ratings.TAG,
                        false,
                        (err, record) => {
                            if (err) return callback(err);
                            record = new Rating(record);

                            Summaries.addRating(record, (err, data) => {
                                return callback(null, { rating: record, summary: data });
                            });
                        }
                    );
                }
            }
        );
    }
    /**
     * Edit single rating instance
     * @param {Rating} rating Instance of rating data class
     * @param {Function} callback Callback function
     */
    static set(originalRating, rating, callback) {
        if (!(rating instanceof Rating))
            return callback(new Error("Only Rating instance can be used"));

        rating.lastUpdatedOn = new Date();

        buildfire.appData.update(
            rating.id,
            rating.toJSON(),
            Ratings.TAG,
            (err, record) => {
                if (err) return callback(err);
                record = new Rating(record);
                Summaries.updateRating(originalRating, record, (err, data) => {
                    return callback(null, { rating: record, summary: data });
                });
            }
        );
    }
    /**
     * Delete single rating instance
     * @param {Rating} rating Instance of rating data class
     * @param {Function} callback Callback function
     */
    static del(rating, callback) {
        if (!(rating instanceof Rating))
            return callback(new Error("Only Rating instance can be used"));

        buildfire.appData.delete(rating.id, Ratings.TAG, (err, record) => {
            if (err) return callback(err);
            Summaries.deleteRating(rating, (err, data) => {
                buildfire.messaging.sendMessageToControl({ type: "ratings" });
                return callback(null, { rating, summary: data });
            });
        });
    }

    /**
     * Soft delete single rating instance
     * @param {Rating} rating Instance of rating data class
     * @param {Function} callback Callback function
     */
    static softDel(rating, callback) {
        if (!(rating instanceof Rating))
            return callback(new Error("Only Rating instance can be used"));

        let shouldUpdateSummary = rating.isActive;

        rating.isActive = false;

        buildfire.appData.update(
            rating.id,
            rating.toJSON(),
            Ratings.TAG,
            (err, record) => {
                if (err) return callback(err);
                if (!shouldUpdateSummary) return callback(null, rating);

                Summaries.deleteRating(rating, (err, data) => {
                    buildfire.messaging.sendMessageToControl({ type: "ratings" });
                    return callback(null, rating);
                });
            }
        );
    }
}

class Summary {
    constructor(record = {}) {
        if (!record.data) record.data = {};
        this.id = record.id || undefined;

        this.ratingId = record.data.ratingId || null;
        this.count = record.data.count || 0;
        this.total = record.data.total || 0;
    }

    toJSON() {
        return {
            id: this.id,
            ratingId: this.ratingId,
            count: this.count,
            total: this.total,
            _buildfire: {
                index: {
                    string1: this.ratingId,
                },
            },
        };
    }
}

class Summaries {
    /**
     * Get Database Tag
     */
    static get TAG() {
        return "fivestarsummary";
    }

    /**
     * Get List Of Summaries
     * @param {Object} filters Filters object with search operators
     * @param {Function} callback Callback function
     */
    static search(filters, callback) {
        buildfire.appData.search(filters, Summaries.TAG, (err, records) => {
            if (err) return callback(err);
            return callback(
                null,
                records.map((record) => new Summary(record))
            );
        });
    }

    static addRating(rating, callback) {
        const filters = {
            filter: {
                "_buildfire.index.string1": rating.ratingId,
            },
        };
        buildfire.appData.search(filters, Summaries.TAG, (err, summaries) => {
            if (err) return callback(err);
            let summary = summaries[0];
            if (!summary) {
                summary = new Summary({
                    data: {
                        ratingId: rating.ratingId,
                        count: 1,
                        total: rating.rating,
                    },
                });
                buildfire.appData.insert(
                    summary.toJSON(),
                    Summaries.TAG,
                    false,
                    (err, record) => {
                        if (err) return callback(err);
                        return callback(null, new Summary(record));
                    }
                );
            } else {
                summary = new Summary(summary);

                summary.count++;
                summary.total += rating.rating;

                buildfire.appData.update(
                    summary.id,
                    summary.toJSON(),
                    Summaries.TAG,
                    (err, record) => {
                        if (err) return callback(err);
                        return callback(null, new Summary(record));
                    }
                );
            }
        });
    }

    static updateRating(originalRating, newRating, callback) {
        const filters = {
            filter: {
                "_buildfire.index.string1": newRating.ratingId,
            },
        };
        buildfire.appData.search(filters, Summaries.TAG, (err, summaries) => {
            if (err) return callback(err);
            let summary = new Summary(summaries[0]);

            summary.total += newRating.rating;
            summary.total -= originalRating.rating;

            buildfire.appData.update(
                summary.id,
                summary.toJSON(),
                Summaries.TAG,
                (err, record) => {
                    if (err) return callback(err);
                    return callback(null, new Summary(record));
                }
            );
        });
    }

    static deleteRating(rating, callback) {
        const filters = {
            filter: {
                "_buildfire.index.string1": rating.ratingId,
            },
        };
        buildfire.appData.search(filters, Summaries.TAG, (err, summaries) => {
            if (err) return callback(err);
            let summary = new Summary(summaries[0]);

            summary.total -= rating.rating;
            summary.count--;

            buildfire.appData.update(
                summary.id,
                summary.toJSON(),
                Summaries.TAG,
                (err, record) => {
                    if (err) return callback(err);
                    return callback(null, new Summary(record));
                }
            );
        });
    }
}

const FULL_STAR = "&#9733;";
const ADMIN_TAG = "bf_ratings_admin";

function getNotRatedUI(container) {
    for (let i = 0; i < 5; i++) {
        let star = document.createElement("span");
        star.innerHTML = FULL_STAR;
        star.style.opacity = "0.3";
        container.appendChild(star);
    }
}

function injectRatings(options = {}) {
    let elements = options.elements;
    if (typeof elements === "undefined")
        elements = document.querySelectorAll("[data-rating-id]");

    let ratingIds = options.ratingIds;
    if (typeof ratingIds === "undefined")
        ratingIds = Array.from(elements).map((element) => element.dataset.ratingId);

    const filters = {
        filter: {
            "_buildfire.index.string1": {
                $in: ratingIds,
            },
        },
    };

    Summaries.search(filters, (err, summaries) => {
        if (err) return console.error(err);

        ratingIds.forEach((ratingId, index) => {
            let summary = summaries.find((s) => s.ratingId === ratingId);
            if (!summary) options.notRated = true;

            options.summary = summary;

            injectAverageRating(elements[index], ratingId, options);
        });
    });
}

function injectAverageRating(container, ratingId, options) {
    if (!container) return console.error(`Container not found in DOM`);
    container.innerHTML = "";

    const filters = {
        filter: {
            "_buildfire.index.string1": ratingId,
        },
    };

    if (options.notRated) {
        return getNotRatedUI(container);
    }

    if (options && options.summary) {
        let averageRating = options.summary.total / options.summary.count;
        createStarsUI(container, averageRating, options.hideAverage);
    } else {
        Summaries.search(filters, (err, summaries) => {
            if (err) return console.error(err);
            if (!summaries || !summaries[0] || summaries[0].count === 0) {
                return getNotRatedUI(container);
            }

            let averageRating = summaries[0].total / summaries[0].count;
            createStarsUI(container, averageRating, options && options.hideAverage);
        });
    }

}

function openAddRatingScreen(
    ratingId,
    options = { enableImages: true, headerText: "Leave a review" },
    callback = () => { }
) {
    buildfire.auth.getCurrentUser((err, loggedInUser) => {
        if (err || !loggedInUser) {
            return buildfire.auth.login(
                { allowCancel: true, showMenu: true },
                (err, user) => {
                    if (user) return openAddRatingScreen(ratingId);
                }
            );
        }

        Ratings.findRatingByUser(ratingId, loggedInUser._id, (err, rating) => {
            buildfire.navigation.onBackButtonClick = () => {
                closeAddRatingScreen();
                buildfire.navigation.restoreBackButtonClick();
            };
            if (rating && !rating.isActive) {
                let container = document.createElement("div");
                container.className = "add-rating-screen";
                container.style.padding = "10px";
                container.innerText =
                    "Your rating has been removed for violating community guildelines";
                return document.body.appendChild(container);
            }
            let originalRating;
            if (!rating) {
                rating = new Rating({
                    data: {
                        createdBy: loggedInUser._id,
                        user: {
                            _id: loggedInUser._id,
                            displayName: loggedInUser.displayName,
                            imageUrl: loggedInUser.imageUrl,
                        },
                        ratingId: ratingId,
                    },
                });
            } else {
                originalRating = new Rating({
                    data: rating,
                });
            }

            let backDrop = document.createElement("div");
            backDrop.className = "add-rating-screen";

            let container = document.createElement("div");
            container.className = "add-rating-screen-content";

            let header = document.createElement("div");
            header.className = "add-rating-header";

            let cancelButton = document.createElement("div");
            cancelButton.className = "cancel-rating-button";
            cancelButton.innerText = "Cancel";
            cancelButton.addEventListener("click", () => {
                closeAddRatingScreen();
            });

            let title = document.createElement("div");
            title.className = "add-rating-title";
            title.innerText = rating.id ? "Update Rating" : "Add Rating";

            header.appendChild(cancelButton);
            header.appendChild(title);

            let subtitle = document.createElement("div");
            subtitle.className = "add-rating-subtitle";
            subtitle.innerText = options.headerText;

            let updateStarsUI = () => {
                for (let i = 0; i < 5; i++) {
                    const star = document.getElementById("stars" + i);
                    star.style.opacity = i < rating.rating ? "1" : "0.3";
                }
            };

            let ratingStars = document.createElement("div");
            ratingStars.className = "rating-stars";
            for (let i = 0; i < 5; i++) {
                let star = document.createElement("div");
                star.id = "stars" + i;
                star.addEventListener("click", function () {
                    rating.rating = i + 1;
                    updateStarsUI();
                });
                star.innerHTML = FULL_STAR;
                star.style.color = "#fcb040";
                ratingStars.appendChild(star);
            }

            const openTextDialog = () => {
                buildfire.input.showTextDialog(
                    {
                        placeholder: "Write a review...",
                        saveText: "Save",
                        defaultValue:
                            textArea.innerText !== "Write a review..."
                                ? textArea.innerText
                                : "",
                        attachments: {
                            images: {
                                enable: true,
                                multiple: true,
                            },
                        },
                    },
                    (e, response) => {
                        if (e || response.cancelled) return;
                        rating.comment = response.results[0].textValue;
                        rating.images = [...rating.images, ...response.results[0].images];
                        updateTextAreaUI();
                        updateImagesUI();
                    }
                );
            };

            let updateTextAreaUI = () => {
                textArea.innerText = rating.comment
                    ? rating.comment
                    : "Write a review...";
            };

            let textAreaSubtitle = document.createElement("div");
            textAreaSubtitle.className = "add-rating-subtitle";
            textAreaSubtitle.innerText = "Write a comment:";

            let textArea = document.createElement("div");
            textArea.className = "text-area";
            textArea.addEventListener("click", openTextDialog);

            let imagesContainer = document.createElement("images");
            imagesContainer.className = "review-images-container";

            const removeImage = (index) => {
                rating.images.splice(index, 1);
                updateImagesUI();
            };

            const updateImagesUI = () => {
                imagesContainer.innerHTML = "";
                rating.images.forEach((imageUrl, index) => {
                    let imageContainer = document.createElement("div");
                    imageContainer.className = "review-image-container";

                    let deleteImageButton = document.createElement("div");
                    deleteImageButton.className = "review-image-delete";
                    deleteImageButton.innerHTML = "✖";
                    deleteImageButton.style.background = "red";
                    deleteImageButton.style.color = "white";

                    let image = document.createElement("img");
                    image.className = "review-image";
                    image.src = buildfire.imageLib.resizeImage(imageUrl, {
                        size: "s",
                        aspect: "1:1",
                    });
                    imageContainer.appendChild(image);
                    imageContainer.appendChild(deleteImageButton);
                    imageContainer.addEventListener("click", () => {
                        removeImage(index);
                    });

                    imagesContainer.appendChild(imageContainer);
                });
            };

            let submitButton = document.createElement("div");
            submitButton.className = "submit-button";
            submitButton.innerText = rating.id ? "Update Rating" : "Add Rating";
            submitButton.addEventListener("click", () => {
                if (rating.id) {
                    Ratings.set(originalRating, rating, (err, updatedRating) => {
                        closeAddRatingScreen();
                        buildfire.messaging.sendMessageToControl({ type: "ratings" });
                        callback(err, updatedRating);
                    });
                } else {
                    Ratings.add(rating, (err, addedRating) => {
                        closeAddRatingScreen();
                        buildfire.messaging.sendMessageToControl({ type: "ratings" });
                        callback(err, addedRating);
                    });
                }
            });

            container.appendChild(header);
            container.appendChild(subtitle);
            container.appendChild(ratingStars);
            container.appendChild(textAreaSubtitle);
            container.appendChild(textArea);
            container.appendChild(imagesContainer);

            container.appendChild(submitButton);

            backDrop.appendChild(container);
            document.body.appendChild(backDrop);

            updateImagesUI();
            updateStarsUI();
            updateTextAreaUI();
        });
    });
}

function closeAddRatingScreen() {
    let addRatingScreen = document.querySelector(".add-rating-screen");
    if (!addRatingScreen) return buildfire.navigation.restoreBackButtonClick();

    document.body.removeChild(addRatingScreen);
    buildfire.navigation.restoreBackButtonClick();
}

function createRatingUI(rating) {
    let container = document.createElement("div");
    container.className = "ratings-screen-rating";
    container.id = rating.id;
    container.dataset.rating = JSON.stringify(rating);

    let header = document.createElement("div");
    header.className = "rating-header";
    container.appendChild(header);

    let profileImage = document.createElement("img");
    profileImage.className = "rating-user-image";
    profileImage.src =
        rating.user && rating.user.imageUrl
            ? rating.user.imageUrl
            : "https://pluginserver.buildfire.com/styles/media/avatar-placeholder.png";
    profileImage.src = buildfire.imageLib.resizeImage(profileImage.src, {
        size: "s",
        aspect: "1:1",
    });
    header.appendChild(profileImage);

    let nameAndStars = document.createElement("div");
    nameAndStars.className = "rating-name-and-stars";
    header.appendChild(nameAndStars);

    let userName = document.createElement("div");
    userName.className = "rating-user-display-name";
    userName.innerText =
        rating.user && rating.user.displayName
            ? rating.user.displayName
            : "Unknown User";
    nameAndStars.appendChild(userName);

    let stars = document.createElement("div");
    stars.className = "rating-user-stars";
    nameAndStars.appendChild(stars);

    let starsSpan = document.createElement("span");
    starsSpan.className = "stars-span";
    createStarsUI(starsSpan, Number(rating.rating), true);

    let ratingTime = document.createElement("span");
    ratingTime.className = "rating-time-ago";
    ratingTime.innerHTML = getTimeAgo(new Date(rating.createdOn));

    stars.appendChild(starsSpan);
    stars.appendChild(ratingTime);

    let ratingReview = document.createElement("div");
    ratingReview.className = "rating-review";
    container.appendChild(ratingReview);

    let ratingReviewText = document.createElement("div");
    ratingReviewText.className = "rating-review-text";
    ratingReviewText.innerText =
        rating.comment.length > 120
            ? rating.comment.slice(0, 120) + "..."
            : rating.comment;
    if (rating.comment.length > 120) {
        let seeMore = document.createElement("a");
        seeMore.innerText = "see more";
        seeMore.addEventListener("click", () => {
            ratingReviewText.innerText = rating.comment;
        });
        ratingReviewText.append(seeMore);
    }
    ratingReview.appendChild(ratingReviewText);

    let ratingImages = document.createElement("div");
    ratingImages.className = "rating-review-images";
    ratingReview.appendChild(ratingImages);

    for (let i = 0; i < rating.images.length; i++) {
        const imageUrl = rating.images[i];
        let image = document.createElement("img");
        image.className = "rating-review-image";
        image.src = buildfire.imageLib.resizeImage(imageUrl, {
            size: "m",
            aspect: "1:1",
        });
        ratingImages.appendChild(image);
    }

    return container;
}

function openRatingsScreen(ratingId) {
    let container = document.createElement("div");
    container.className = "ratings-screen";

    buildfire.spinner.show();

    buildfire.navigation.onBackButtonClick = () => {
        closeRatingsScreen();
    };

    let header = document.createElement("div");
    header.className = "ovarall-rating-container";
    let headerTitle = document.createElement("h5");
    headerTitle.innerText = "Overall rating";
    headerTitle.style.fontWeight = 400;
    header.appendChild(headerTitle);

    let headerSubtitle = document.createElement("h6");
    header.appendChild(headerSubtitle);

    let overallRating = document.createElement("div");
    overallRating.className = "overall-rating-stars";
    header.appendChild(overallRating);
    container.appendChild(header);

    Summaries.search(
        {
            filter: {
                "_buildfire.index.string1": ratingId,
            },
        },
        (err, summaries) => {
            if (err) return console.error(err);
            if (!summaries[0]) return getNotRatedUI(overallRating);

            const { count, total } = summaries[0];

            createStarsUI(overallRating, total / count, true);

            headerSubtitle.innerText = "Based on " + count + " Reviews";
        }
    );

    let emptyState = document.createElement("div");
    emptyState.className = "empty-state-container";

    let emptyStateText = document.createElement("h5");
    emptyStateText.innerText = "No reivews yet. Be the first to leave a review!";
    emptyState.appendChild(emptyStateText);

    let leaveReviewButton = document.createElement("div");
    leaveReviewButton.innerText = "Leave a review";
    leaveReviewButton.addEventListener("click", () => {
        closeRatingsScreen();
        openAddRatingScreen(ratingId);
    });

    emptyState.appendChild(leaveReviewButton);


    checkIfUserIsAdmin((isAdmin) => {
        console.log(isAdmin)
        Ratings.search(
            {
                filter: {
                    "_buildfire.index.string1": ratingId,
                    "_buildfire.index.number1": 1,
                },
            },
            (err, ratings) => {
                if (err) return console.error(err);

                if (ratings.length === 0) {
                    container.appendChild(emptyState);
                }

                ratings.forEach((rating) => {
                    let ratingUI = createRatingUI(rating);
                    if (isAdmin) {
                        addControlsToRating(ratingUI)
                    }
                    container.appendChild(ratingUI);
                });

                document.body.appendChild(container);
                buildfire.spinner.hide();
            }
        );
    })
}

function checkIfUserIsAdmin(cb) {
    buildfire.auth.getCurrentUser((err, loggedInUser) => {
        if (err || !loggedInUser || !loggedInUser.tags) return cb(true);
        Object.keys(loggedInUser.tags).forEach(appId => {
            let tagIndex = loggedInUser.tags[appId].findIndex(tagObject => tagObject.tagName == ADMIN_TAG);
            if (tagIndex != -1) return cb(true);
        })
        return cb(false);
    })
}

function getTimeAgo(date) {
    let seconds = Math.floor((new Date() - date) / 1000);

    let interval = Math.floor(seconds / 31536000);

    if (interval > 1) return interval + " years ago";
    interval = Math.floor(seconds / 2592000);

    if (interval > 1) return interval + " months ago";
    interval = Math.floor(seconds / 86400);

    if (interval > 1) return interval + " days ago";
    interval = Math.floor(seconds / 3600);

    if (interval > 1) return interval + " hours ago";
    interval = Math.floor(seconds / 60);

    if (interval > 1) return interval + " minutes ago";

    return Math.floor(seconds) + " seconds ago";
}

function closeRatingsScreen() {
    let ratingsScreen = document.querySelector(".ratings-screen");

    document.body.removeChild(ratingsScreen);
    buildfire.navigation.restoreBackButtonClick();
}

function createStarsUI(container, averageRating, hideAverage) {
    container.innerHTML = "";
    container.classList.add("flex-center")
    for (let i = 1; i < 6; i++) {
        let star = document.createElement("span");
        star.innerHTML = FULL_STAR;
        star.className = "full-star";

        if (i > averageRating && i === Math.trunc(averageRating) + 1) {
            star.innerHTML = `<span style="opacity: 0.3">${FULL_STAR}</span>`;
            let percentage = (averageRating - Math.trunc(averageRating)) * 100;
            star.style.position = "relative";
            let otherHalf = document.createElement("span");
            otherHalf.innerHTML = FULL_STAR;
            otherHalf.className = "half-star";
            otherHalf.style.backgroundImage = `linear-gradient(to right, currentColor ${percentage}%, transparent ${percentage}%)`;
            star.appendChild(otherHalf);
        } else if (i > averageRating) {
            star.style.opacity = "0.3";
        }
        container.appendChild(star);
    }
    if (!hideAverage) {
        let averageRatingSpan = document.createElement("span");
        averageRatingSpan.className = "average-rating";
        averageRatingSpan.innerText = averageRating.toFixed(1);

        container.appendChild(averageRatingSpan);
    }
}

function injectRatingComponent(container, ratingId, options) {
    buildfire.auth.getCurrentUser((err, loggedInUser) => {
        let userId = loggedInUser ? loggedInUser._id : undefined;

        container.innerHTML = "";
        let ratings = document.createElement("div");
        ratings.className = "ratings";

        let ratingsHead = document.createElement("div");
        ratingsHead.className = "ratings-head";

        let ratingsText = document.createElement("div");
        ratingsText.className = "ratings-text primary-color";
        ratingsText.innerText = "Ratings";

        let viewAllButton = document.createElement("div");
        viewAllButton.className = "view-all-button";
        viewAllButton.innerText = "View All";
        viewAllButton.addEventListener("click", () => {
            openRatingsScreen(ratingId);
        });

        ratingsHead.appendChild(ratingsText);
        ratingsHead.appendChild(viewAllButton);

        let reviewsContainer = document.createElement("div");
        reviewsContainer.className = "reviews-container";

        let addRatingButton = document.createElement("div");
        addRatingButton.className = "add-rating-button";
        addRatingButton.innerText = "+ ADD RATING";
        addRatingButton.addEventListener("click", () => {
            openAddRatingScreen(ratingId, options, (err, rating) => {
                getSummary();
            });
        });

        ratings.appendChild(ratingsHead);
        ratings.appendChild(reviewsContainer);

        if (userId)
            ratings.appendChild(addRatingButton);

        const getSummary = () => {
            Summaries.search(
                {
                    filter: {
                        "_buildfire.index.string1": ratingId,
                    },
                },
                (err, summaries) => {
                    if (err) return console.err(err);

                    if (!summaries || !summaries[0] || summaries[0].count === 0) {
                        return getNotRatedUI(reviewsContainer);
                    }

                    let averageRating = summaries[0].total / summaries[0].count;
                    createStarsUI(reviewsContainer, averageRating, true);
                }
            );
        };

        Ratings.search(
            {
                filter: {
                    "_buildfire.index.string1": ratingId,
                    "_buildfire.index.array1": userId,
                },
            },
            (err, ratings) => {
                if (err) return console.error(err);
                if (ratings && ratings[0]) addRatingButton.innerText = "EDIT RATING";
            }
        );

        getSummary();

        container.appendChild(ratings);
    })
}

function addControlsToRating(ratingElement) {
    let rating = JSON.parse(ratingElement.dataset.rating);
    rating = new Rating({ data: rating, id: rating.id });

    if (!rating.isActive) {
        let inActiveRating = document.createElement("div");
        inActiveRating.innerText = "This rating has been blocked";
        ratingElement.appendChild(inActiveRating);
    }

    let controls = document.createElement("div");

    let deleteButton = document.createElement("button");
    deleteButton.innerText = "Delete";
    deleteButton.className = "delete-button";
    deleteButton.addEventListener("click", () => {
        buildfire.notifications.confirm(
            {
                title: "Are you sure?",
                message: "Are you sure you want to remove this review?",
                confirmButton: { text: "Yes", key: "yes", type: "danger" },
                cancelButton: { text: "No", key: "no", type: "default" },
            },
            function (e, data) {
                if ((e && e !== 2) || (data && data.selectedButton.key === "yes")) {
                    Ratings.del(rating, (err, data) => {
                        let ratingElement = document.getElementById(data.rating.id);
                        ratingElement.parentElement.removeChild(ratingElement);
                    });
                }
            }
        );
    });

    let blockButton = document.createElement("button");
    blockButton.innerText = "Block";
    blockButton.className = "delete-button";
    blockButton.addEventListener("click", () => {
        buildfire.notifications.confirm(
            {
                title: "Are you sure you want to block this review?",
                message: "User will not be able to submit another review for this item",
                confirmButton: { text: "Yes", key: "yes", type: "danger" },
                cancelButton: { text: "No", key: "no", type: "default" },
            },
            function (e, data) {
                if ((e && e !== 2) || (data && data.selectedButton.key === "yes")) {
                    Ratings.softDel(rating, (err, data) => {
                        // let ratingElement = document.getElementById(data.rating.id);
                        // ratingElement.parentElement.removeChild(ratingElement)
                    });
                }
            }
        );
    });
    controls.appendChild(deleteButton);
    controls.appendChild(blockButton);

    ratingElement.appendChild(controls);
}

buildfire.components.ratingSystem = {
    injectRatings,
    injectRatingComponent,
    openAddRatingScreen,
    openRatingsScreen,
};
